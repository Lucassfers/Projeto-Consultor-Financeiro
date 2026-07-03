import express from "express";
import cors from "cors";
import "dotenv/config";
import next from "next";
import pg from "pg";
import crypto from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
const LLM_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 90000);
const LLM_CACHE_TTL_MS = Number(process.env.OPENROUTER_CACHE_TTL_MS || 15 * 60 * 1000);
const LLM_PROMPT_CHAR_LIMIT = Number(process.env.OPENROUTER_PROMPT_CHAR_LIMIT || 1400);
const LLM_RESPONSE_TOKEN_LIMIT = Number(process.env.OPENROUTER_RESPONSE_TOKENS || 260);
const LLM_REPORT_VERSION = "financial-actions-v2";
const isDevelopment = process.env.NODE_ENV !== "production";
const nextApp = next({ dev: isDevelopment, hostname: "localhost", port: PORT });
const handleNextRequest = nextApp.getRequestHandler();
const llmCache = new Map();
const pendingLlmRequests = new Map();

if (!API_KEY) {
  console.error("Erro: configure OPENROUTER_API_KEY no arquivo .env.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("Erro: configure DATABASE_URL no arquivo .env.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function categoryFromRow(row) {
  return { id: row.id, name: row.name, type: row.type, color: row.color, createdAt: row.created_at };
}

function importFromRow(row) {
  return {
    id: row.id,
    importId: row.import_id,
    fileName: row.original_file_name,
    bank: row.bank,
    statementMonth: row.statement_month,
    transactionCount: Number(row.transaction_count),
    total: Number(row.total || 0),
    createdAt: row.created_at,
  };
}

function importDetailFromRow(row, transactions) {
  return { ...importFromRow(row), transactions };
}

function transactionFromRow(row) {
  const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
  const [year, month, day] = date.split("-");
  return {
    id: row.id,
    date: `${day}/${month}/${year}`,
    description: row.description,
    amount: Number(row.amount),
    type: row.type,
    importId: row.import_id,
    category: row.category_name || "",
    confidence: Number(row.ocr_confidence ?? 1),
    statementMonth: row.statement_month,
    sourceFile: row.original_file_name,
    importedAt: row.created_at,
    bank: row.bank,
  };
}

function databaseMonth(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(String(value));
  if (!match) throw new Error(`Mes da fatura invalido: ${value}`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Mes da fatura invalido: ${value}`);
  return `${match[1]}-${match[2]}`;
}

function databaseDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
  if (!match) throw new Error(`Data invalida: ${value}`);
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) throw new Error(`Data invalida: ${value}`);
  return result;
}

await nextApp.prepare();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.get("/favicon.ico", (_request, response) => {
  response.status(204).end();
});

app.get("/api/categories", async (_request, response) => {
  try {
    const { rows } = await pool.query("SELECT id, name, type, color, created_at FROM categories WHERE active = true ORDER BY type, name");
    response.json(rows.map(categoryFromRow));
  } catch (error) {
    console.error("Erro ao listar categorias:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar as categorias." });
  }
});

app.post("/api/categories", async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const type = request.body?.type;
  const color = request.body?.color;
  if (!name || !["income", "expense"].includes(type) || !/^#[0-9a-f]{6}$/i.test(color)) return response.status(400).json({ erro: "Dados da categoria invalidos." });
  try {
    const { rows } = await pool.query("INSERT INTO categories (name, type, color) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET type=EXCLUDED.type, color=EXCLUDED.color, active=true RETURNING id, name, type, color, created_at", [name, type, color]);
    response.status(201).json(categoryFromRow(rows[0]));
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    response.status(500).json({ erro: "Nao foi possivel cadastrar a categoria." });
  }
});

app.put("/api/categories/:id", async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const type = request.body?.type;
  const color = request.body?.color;
  if (!name || !["income", "expense"].includes(type) || !/^#[0-9a-f]{6}$/i.test(color)) return response.status(400).json({ erro: "Dados da categoria invalidos." });
  try {
    const { rows } = await pool.query("UPDATE categories SET name=$1, type=$2, color=$3 WHERE id=$4 AND active=true RETURNING id, name, type, color, created_at", [name, type, color, request.params.id]);
    if (!rows.length) return response.status(404).json({ erro: "Categoria nao encontrada." });
    response.json(categoryFromRow(rows[0]));
  } catch (error) {
    if (error?.code === "23505") return response.status(409).json({ erro: "Ja existe uma categoria com esse nome." });
    console.error("Erro ao atualizar categoria:", error);
    response.status(500).json({ erro: "Nao foi possivel atualizar a categoria." });
  }
});

app.delete("/api/categories/:id", async (request, response) => {
  try {
    const result = await pool.query("UPDATE categories SET active=false WHERE id=$1 AND active=true", [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ erro: "Categoria nao encontrada." });
    response.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    response.status(500).json({ erro: "Nao foi possivel excluir a categoria." });
  }
});

app.get("/api/imports", async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.bank, i.original_file_name, i.transaction_count, i.created_at, i.statement_month,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total
      FROM imports i LEFT JOIN transactions t ON t.import_id = i.id
      WHERE i.status = 'completed'
      GROUP BY i.id ORDER BY i.created_at DESC
    `);
    response.json(rows.map(importFromRow));
  } catch (error) {
    console.error("Erro ao listar importacoes:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar as importacoes." });
  }
});

app.get("/api/imports/:id", async (request, response) => {
  try {
    const { rows: importRows } = await pool.query(`
      SELECT i.id, i.bank, i.original_file_name, i.transaction_count, i.created_at, i.statement_month,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total
      FROM imports i LEFT JOIN transactions t ON t.import_id = i.id
      WHERE i.id = $1 AND i.status = 'completed'
      GROUP BY i.id
    `, [request.params.id]);
    if (!importRows.length) return response.status(404).json({ erro: "Importacao nao encontrada." });
    const { rows: transactionRows } = await pool.query(`
      SELECT t.id, t.import_id, t.date, t.description, t.amount, t.type, t.ocr_confidence, t.created_at,
        COALESCE(c.name, t.category_name) AS category_name,
        i.statement_month, i.original_file_name, i.bank
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN imports i ON i.id = t.import_id
      WHERE t.import_id = $1 AND t.type <> 'ignored'
      ORDER BY t.date ASC, t.created_at ASC
    `, [request.params.id]);
    response.json(importDetailFromRow(importRows[0], transactionRows.map(transactionFromRow)));
  } catch (error) {
    console.error("Erro ao carregar importacao:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar a importacao." });
  }
});

app.get("/api/transactions", async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.import_id, t.date, t.description, t.amount, t.type, t.ocr_confidence, t.created_at,
        COALESCE(c.name, t.category_name) AS category_name,
        i.statement_month, i.original_file_name, i.bank
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN imports i ON i.id = t.import_id
      WHERE t.type <> 'ignored'
      ORDER BY t.date DESC, t.created_at DESC
    `);
    response.json(rows.map(transactionFromRow));
  } catch (error) {
    console.error("Erro ao listar transacoes:", error);
    response.status(500).json({ erro: "Nao foi possivel carregar as transacoes." });
  }
});

app.post("/api/imports", async (request, response) => {
  const { bank, fileName, statementMonth, transactions } = request.body || {};
  if (!["nubank", "banco-do-brasil"].includes(bank) || !String(fileName || "").trim() || !Array.isArray(transactions) || !transactions.length) return response.status(400).json({ erro: "Dados da importacao invalidos." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO imports (bank, original_file_name, status, transaction_count, statement_month) VALUES ($1, $2, 'completed', $3, $4) RETURNING id, bank, original_file_name, transaction_count, created_at, statement_month", [bank, String(fileName).slice(0, 255), transactions.length, databaseMonth(statementMonth)]);
    const categoryRows = await client.query("SELECT id, name FROM categories WHERE active=true");
    const categoryIds = new Map(categoryRows.rows.map((row) => [row.name, row.id]));
    let total = 0;
    for (const item of transactions) {
      if (!["income", "expense"].includes(item.type) || !String(item.description || "").trim() || !Number.isFinite(Number(item.amount))) throw new Error("Uma das transacoes possui dados invalidos.");
      const amount = Math.abs(Number(item.amount));
      if (item.type === "expense") total += amount;
      await client.query("INSERT INTO transactions (import_id, category_id, date, description, amount, type, ocr_confidence, category_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [inserted.rows[0].id, categoryIds.get(item.category) || null, databaseDate(item.date), String(item.description).trim().slice(0, 500), amount, item.type, Number(item.confidence ?? 1), item.category || null]);
    }
    await client.query("COMMIT");
    response.status(201).json(importFromRow({ ...inserted.rows[0], total }));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao salvar importacao:", error);
    response.status(400).json({ erro: error instanceof Error ? error.message : "Nao foi possivel salvar a importacao." });
  } finally {
    client.release();
  }
});

app.put("/api/imports/:id/transactions", async (request, response) => {
  const transactions = request.body?.transactions;
  if (!Array.isArray(transactions) || !transactions.length) return response.status(400).json({ erro: "Informe as transacoes para atualizar." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const importCheck = await client.query("SELECT id FROM imports WHERE id=$1 AND status='completed'", [request.params.id]);
    if (!importCheck.rows.length) {
      await client.query("ROLLBACK");
      return response.status(404).json({ erro: "Importacao nao encontrada." });
    }
    const categoryRows = await client.query("SELECT id, name, type FROM categories WHERE active=true");
    const categoriesByName = new Map(categoryRows.rows.map((row) => [row.name, row]));
    for (const item of transactions) {
      const id = String(item.id || "").trim();
      const category = String(item.category || "").trim();
      if (!id || !category) throw new Error("Todas as transacoes precisam de uma categoria.");
      const transaction = await client.query("SELECT id, type FROM transactions WHERE id=$1 AND import_id=$2", [id, request.params.id]);
      if (!transaction.rows.length) throw new Error("Uma das transacoes nao pertence a esta importacao.");
      const categoryRow = categoriesByName.get(category);
      if (!categoryRow || categoryRow.type !== transaction.rows[0].type) throw new Error(`Categoria invalida para a transacao: ${category}`);
      await client.query("UPDATE transactions SET category_id=$1, category_name=$2 WHERE id=$3 AND import_id=$4", [categoryRow.id, categoryRow.name, id, request.params.id]);
    }
    await client.query("COMMIT");
    const { rows } = await pool.query(`
      SELECT t.id, t.import_id, t.date, t.description, t.amount, t.type, t.ocr_confidence, t.created_at,
        COALESCE(c.name, t.category_name) AS category_name,
        i.statement_month, i.original_file_name, i.bank
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN imports i ON i.id = t.import_id
      WHERE t.import_id = $1 AND t.type <> 'ignored'
      ORDER BY t.date ASC, t.created_at ASC
    `, [request.params.id]);
    response.json(rows.map(transactionFromRow));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao atualizar importacao:", error);
    response.status(400).json({ erro: error instanceof Error ? error.message : "Nao foi possivel atualizar a importacao." });
  } finally {
    client.release();
  }
});

app.get("/api/status", (_request, response) => {
  response.json({
    status: "API local funcionando",
    model: MODEL,
    promptLimit: LLM_PROMPT_CHAR_LIMIT,
    responseTokenLimit: LLM_RESPONSE_TOKEN_LIMIT,
    reportVersion: LLM_REPORT_VERSION,
  });
});

function sanitizeLlmResponseLegacy(text) {
  return String(text)
    .replace(/\*?Esta analise nao substitui a consultoria de um profissional de financas\. Avalie sempre suas condicoes especificas antes de tomar decisoes\.\*?/gi, "")
    .replace(/\*?Esta análise não substitui a consultoria de um profissional de finanças\. Avalie sempre suas condições específicas antes de tomar decisões\.\*?/gi, "")
    .trim();
}

function sanitizeLlmResponse(text) {
  const disclaimer = "esta analise nao substitui a consultoria de um profissional de financas";
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(disclaimer))
    .join("\n")
    .trim();
}

function extractOpenRouterMessage(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.error?.message === "string") return payload.error.message;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  return "";
}

function openRouterErrorHint(status, detail) {
  const text = String(detail || "").toLowerCase();
  if (status === 401 || status === 403) return "Chave do OpenRouter invalida, sem permissao ou sem acesso a este modelo.";
  if (status === 402 || text.includes("credit") || text.includes("quota")) return "Credito ou cota do OpenRouter acabou. Confira saldo/limite da conta.";
  if (status === 429 || text.includes("rate limit") || text.includes("provider returned error")) {
    return "O modelo gratuito/provedor do OpenRouter recusou por limite ou alta demanda. Aguarde alguns minutos, tente de novo ou use outro modelo na variavel OPENROUTER_MODEL.";
  }
  if (status === 400 && (text.includes("context") || text.includes("token") || text.includes("maximum"))) return "A mensagem ficou grande demais para o modelo. O app agora envia um resumo menor; se persistir, troque o modelo gratuito ou reduza faturas selecionadas.";
  if (status >= 500) return "O OpenRouter ou o provedor do modelo esta instavel no momento. Tente novamente ou troque o modelo.";
  return detail || `HTTP ${status}`;
}

function shouldUseLocalFallback(status, detail) {
  const text = String(detail || "").toLowerCase();
  return status === 429 || text.includes("provider returned error") || text.includes("rate limit");
}

function parseBrazilianCurrency(value) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parsePromptLine(prompt, label) {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "im");
  return prompt.match(pattern)?.[1]?.trim() || "";
}

function parseExpenseLines(prompt) {
  const section = prompt.match(/Gastos por categoria, ja somados:\s*([\s\S]*?)\n\nObjetivos principais selecionados:/i)?.[1] || "";
  return section
    .split(/\r?\n/)
    .map((line) => line.replace(/^-\s*/, "").trim())
    .map((line) => {
      const [category, value] = line.split(/:\s*/);
      return { category: category || "Outros", value: parseBrazilianCurrency(value) };
    })
    .filter((item) => item.category && item.value > 0);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function buildLocalFinancialReport(prompt) {
  const income = parseBrazilianCurrency(parsePromptLine(prompt, "Renda mensal"));
  const reserve = parseBrazilianCurrency(parsePromptLine(prompt, "Reserva atual"));
  const totalExpenses = parseBrazilianCurrency(parsePromptLine(prompt, "Total de gastos"));
  const monthlyBalance = parseBrazilianCurrency(parsePromptLine(prompt, "Saldo mensal"));
  const spendingRate = Number(parsePromptLine(prompt, "Taxa de gastos").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
  const emergencyMonths = Number(parsePromptLine(prompt, "Reserva cobre").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
  const riskProfile = parsePromptLine(prompt, "Perfil de investimento") || "nao informado";
  const stability = parsePromptLine(prompt, "Estabilidade da renda") || "nao informada";
  const goals = parsePromptLine(prompt, "Objetivos principais selecionados") || "nao informado";
  const expenses = parseExpenseLines(prompt).sort((first, second) => second.value - first.value);
  const mainExpense = expenses[0];
  const balanceTone = monthlyBalance >= 0 ? "positivo" : "negativo";
  const reserveTone = emergencyMonths >= 6 ? "boa" : emergencyMonths >= 3 ? "em formacao" : "baixa";
  const minimumSavingsTarget = Math.max(income * 0.02, 20);
  const suggestedSavingsTarget = monthlyBalance > 0
    ? Math.min(Math.max(minimumSavingsTarget, monthlyBalance * 0.2), monthlyBalance)
    : minimumSavingsTarget;
  const expenseCutTarget = mainExpense ? Math.max(mainExpense.value * 0.05, 20) : Math.max(totalExpenses * 0.03, 20);
  const surpriseFundTarget = Math.max(income * 0.02, totalExpenses * 0.03, 30);
  const priority = monthlyBalance < 0
    ? "reduzir gastos e recuperar saldo positivo"
    : emergencyMonths < 3
      ? "montar reserva antes de assumir risco"
      : "organizar aportes de acordo com o objetivo";
  const variableIncomeUse = monthlyBalance > 0 && emergencyMonths >= 6 && riskProfile !== "conservador" ? "Media" : "Baixa";

  return [
    "## Diagnostico",
    `Seu saldo mensal esta ${balanceTone}: ${currency(monthlyBalance)}. A renda informada e ${currency(income)} e os gastos somam ${currency(totalExpenses)}.`,
    `A reserva cobre cerca de ${emergencyMonths.toFixed(1)} meses de gastos, uma situacao ${reserveTone}. Objetivos: ${goals}.`,
    "",
    "## Pontos de atencao",
    `- Taxa de gastos em ${spendingRate.toFixed(1)}%; acompanhe para manter espaco para reserva e objetivos.`,
    `- Principal gasto mapeado: ${mainExpense ? `${mainExpense.category} (${currency(mainExpense.value)})` : "nenhuma categoria relevante informada"}.`,
    `- Estabilidade da renda: ${stability}; perfil de investimento: ${riskProfile}.`,
    "",
    "## Caminhos de investimento personalizados",
    "| Classe | Motivo | Uso recomendado |",
    "| --- | --- | --- |",
    `| Reserva em renda fixa liquida | Ajuda a proteger o orcamento antes de assumir risco. | ${emergencyMonths < 6 ? "Alta" : "Media"} |`,
    `| Tesouro Selic, CDB com liquidez ou fundo DI simples | Combina com reserva e objetivos de curto prazo. | ${monthlyBalance > 0 ? "Alta" : "Media"} |`,
    `| Renda variavel diversificada | So faz sentido depois de reserva e saldo mensal sob controle. | ${variableIncomeUse} |`,
    "",
    "## Plano de acao",
    "| Etapa | Acao | Prazo |",
    "| --- | --- | --- |",
    `| 1 | Priorizar ${priority}. | 30 dias |`,
    "| 2 | Revisar as maiores categorias e definir um teto mensal. | 60 dias |",
    "| 3 | Automatizar um aporte apenas se o saldo mensal continuar positivo. | 90 dias |",
    "",
    "## Proximos passos",
    `- Economize ao menos 2% da renda: separe ${currency(suggestedSavingsTarget)} por mes assim que receber, antes dos gastos variaveis.`,
    `- Reduza gastos com imprevistos: reserve ${currency(surpriseFundTarget)} por mes para pequenas emergencias e evite parcelar despesas inesperadas.`,
    `- Corte uma categoria prioritaria: diminua ${mainExpense ? `${mainExpense.category} em cerca de ${currency(expenseCutTarget)}` : `gastos variaveis em cerca de ${currency(expenseCutTarget)}`} no proximo mes e acompanhe se o saldo melhora.`,
  ].join("\n");
}

function llmCacheKey(prompt) {
  return crypto.createHash("sha256").update(`${LLM_REPORT_VERSION}\n${MODEL}\n${prompt.trim()}`).digest("hex");
}

function getCachedLlmResponse(key) {
  const cached = llmCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > LLM_CACHE_TTL_MS) {
    llmCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedLlmResponse(key, value) {
  llmCache.set(key, { createdAt: Date.now(), value });
  if (llmCache.size > 30) {
    const oldestKey = llmCache.keys().next().value;
    if (oldestKey) llmCache.delete(oldestKey);
  }
}

app.post("/api/llm", async (request, response) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const { prompt } = request.body ?? {};

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return response.status(400).json({ erro: "O campo prompt e obrigatorio." });
    }

    if (prompt.length > LLM_PROMPT_CHAR_LIMIT) {
      return response.status(400).json({ erro: `Limite: ${LLM_PROMPT_CHAR_LIMIT} caracteres.` });
    }

    const promptText = prompt.trim();
    const cacheKey = llmCacheKey(promptText);
    const cached = getCachedLlmResponse(cacheKey);
    if (cached) {
      console.info(`[llm] Resposta reutilizada do cache. modelo=${MODEL} prompt=${promptText.length}`);
      return response.json({ ...cached, cached: true });
    }

    const pending = pendingLlmRequests.get(cacheKey);
    if (pending) {
      console.info(`[llm] Aguardando requisicao identica ja em andamento. modelo=${MODEL} prompt=${promptText.length}`);
      const result = await pending;
      return response.json({ ...result, cached: true });
    }

    const requestPromise = (async () => {
      console.info(`[llm] Consultando OpenRouter. modelo=${MODEL} prompt=${promptText.length} timeout=${LLM_TIMEOUT_MS}ms`);

      const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || `http://localhost:${PORT}`,
          "X-OpenRouter-Title": "Finora - Projeto FIA ADS",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: [
                "Voce e um consultor financeiro educacional brasileiro.",
                "Use somente os dados enviados, nao invente valores e responda em pt-BR.",
                "Se sugerir investimentos, cite classes brasileiras adequadas ao perfil e priorize reserva/dividas quando necessario.",
                "Seja objetivo e nao prometa rentabilidade.",
              ].join(" "),
            },
            { role: "user", content: promptText },
          ],
          temperature: 0.4,
          max_tokens: LLM_RESPONSE_TOKEN_LIMIT,
        }),
      });

      const rawBody = await openRouterResponse.text();
      let data = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        data = {};
      }

      if (!openRouterResponse.ok) {
        const detalhe = extractOpenRouterMessage(data) || rawBody || `HTTP ${openRouterResponse.status}`;
        const dica = openRouterErrorHint(openRouterResponse.status, detalhe);
        console.error(`[llm] OpenRouter recusou a consulta. status=${openRouterResponse.status} detalhe=${detalhe}`);
        if (shouldUseLocalFallback(openRouterResponse.status, detalhe)) {
          const result = {
            modelo: `${MODEL} (fallback local)`,
            resposta: buildLocalFinancialReport(promptText),
            uso: data.usage ?? null,
            fallback: true,
            dica,
          };
          console.info(`[llm] Fallback local gerado em ${Date.now() - startedAt}ms. motivo=${detalhe}`);
          return result;
        }
        const error = new Error(detalhe);
        error.statusCode = openRouterResponse.status === 429 ? 429 : 502;
        error.body = {
          erro: "Erro ao consultar o OpenRouter.",
          status: openRouterResponse.status,
          detalhe,
          dica,
        };
        throw error;
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        const error = new Error("Resposta vazia ou inesperada.");
        error.statusCode = 502;
        error.body = { erro: "Resposta vazia ou inesperada." };
        throw error;
      }

      const result = { modelo: MODEL, resposta: sanitizeLlmResponse(text), uso: data.usage ?? null };
      setCachedLlmResponse(cacheKey, result);
      console.info(`[llm] Analise concluida em ${Date.now() - startedAt}ms.`);
      return result;
    })();

    pendingLlmRequests.set(cacheKey, requestPromise);
    try {
      const result = await requestPromise;
      return response.json(result);
    } finally {
      pendingLlmRequests.delete(cacheKey);
    }
  } catch (error) {
    if (error?.statusCode && error?.body) {
      return response.status(error.statusCode).json(error.body);
    }

    if (error?.name === "AbortError") {
      console.error(`[llm] Tempo limite excedido apos ${LLM_TIMEOUT_MS}ms.`);
      return response.status(504).json({
        erro: "A consulta demorou demais para responder. Tente novamente ou altere o modelo do OpenRouter.",
        detalhe: `Tempo limite: ${Math.round(LLM_TIMEOUT_MS / 1000)} segundos.`,
      });
    }

    console.error("Erro interno ao consultar o OpenRouter:", error);
    return response.status(500).json({
      erro: "Erro interno no servidor.",
      detalhe: error instanceof Error ? error.message : "Erro desconhecido.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.use((request, response) => handleNextRequest(request, response));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
