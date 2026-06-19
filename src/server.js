const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicPath));

function toMoney(value) {
  return Number(value || 0);
}

function calculateFinancialData(payload) {
  const income = toMoney(payload.income);
  const reserve = toMoney(payload.reserve);
  const age = Number(payload.age || 0);
  const monthlyDebt = toMoney(payload.monthlyDebt);
  const stability = payload.stability || "media";
  const riskProfile = payload.riskProfile || "conservador";
  const expenses = payload.expenses || {};

  const normalizedExpenses = Object.entries(expenses).map(([category, value]) => ({
    category,
    value: toMoney(value)
  }));

  const totalExpenses = normalizedExpenses.reduce((sum, item) => sum + item.value, 0);
  const monthlyBalance = income - totalExpenses;
  const spendingRate = income > 0 ? (totalExpenses / income) * 100 : 0;
  const savingRate = income > 0 ? (monthlyBalance / income) * 100 : 0;
  const debtRate = income > 0 ? (monthlyDebt / income) * 100 : 0;
  const emergencyMonths = totalExpenses > 0 ? reserve / totalExpenses : 0;

  const categoryPercentages = normalizedExpenses.map((item) => ({
    ...item,
    percentage: totalExpenses > 0 ? (item.value / totalExpenses) * 100 : 0
  }));

  const stabilityWeights = {
    baixa: 0.35,
    media: 0.7,
    alta: 1
  };
  const reserveScore = Math.min(emergencyMonths / 6, 1) * 35;
  const savingScore = Math.max(Math.min(savingRate / 20, 1), 0) * 25;
  const debtScore = Math.max(1 - debtRate / 30, 0) * 20;
  const stabilityScore = (stabilityWeights[stability] || stabilityWeights.media) * 20;
  const score = Math.round(reserveScore + savingScore + debtScore + stabilityScore);

  return {
    income,
    reserve,
    age,
    monthlyDebt,
    stability,
    riskProfile,
    totalExpenses,
    monthlyBalance,
    spendingRate,
    savingRate,
    debtRate,
    emergencyMonths,
    score,
    categoryPercentages
  };
}

function buildPrompt(metrics) {
  return `
Voce e um consultor financeiro brasileiro, claro e responsavel.
Perfil do usuario: ${metrics.riskProfile}.

Dados calculados pelo sistema:
- Idade: ${metrics.age}
- Salario mensal: R$ ${metrics.income.toFixed(2)}
- Reserva atual: R$ ${metrics.reserve.toFixed(2)}
- Dividas mensais: R$ ${metrics.monthlyDebt.toFixed(2)}
- Estabilidade financeira: ${metrics.stability}
- Total de gastos: R$ ${metrics.totalExpenses.toFixed(2)}
- Sobra mensal: R$ ${metrics.monthlyBalance.toFixed(2)}
- Taxa de gastos: ${metrics.spendingRate.toFixed(1)}%
- Taxa de poupanca: ${metrics.savingRate.toFixed(1)}%
- Taxa de endividamento: ${metrics.debtRate.toFixed(1)}%
- Reserva cobre ${metrics.emergencyMonths.toFixed(1)} meses
- Score financeiro: ${metrics.score}/100

Gastos por categoria:
${metrics.categoryPercentages
  .map((item) => `- ${item.category}: R$ ${item.value.toFixed(2)} (${item.percentage.toFixed(1)}%)`)
  .join("\n")}

Escreva uma analise em portugues do Brasil com:
1. diagnostico financeiro;
2. principais problemas;
3. sugestoes de economia e cortes por categoria;
4. recomendacoes de investimento adequadas ao perfil.
Nao refaca os calculos. Use os numeros enviados pelo sistema.
`;
}

function localAdvice(metrics) {
  const lines = [];

  lines.push(`Seu score financeiro ficou em ${metrics.score}/100.`);
  lines.push(
    `Sua taxa de gastos esta em ${metrics.spendingRate.toFixed(1)}% da renda e sua reserva cobre ${metrics.emergencyMonths.toFixed(1)} meses.`
  );

  if (metrics.monthlyBalance < 0) {
    lines.push("Voce esta gastando mais do que ganha. O primeiro foco deve ser cortar despesas e evitar novas dividas.");
  } else if (metrics.savingRate < 10) {
    lines.push("Existe sobra mensal, mas a taxa de poupanca ainda esta baixa. Tente reservar pelo menos 10% da renda.");
  } else {
    lines.push("Sua sobra mensal e positiva. Esse e um bom ponto de partida para fortalecer a reserva e investir com regularidade.");
  }

  if (metrics.emergencyMonths < 6) {
    lines.push("Antes de assumir riscos maiores, priorize montar uma reserva de emergencia entre 3 e 6 meses de gastos.");
  }

  const highestExpense = [...metrics.categoryPercentages].sort((a, b) => b.value - a.value)[0];
  if (highestExpense) {
    lines.push(
      `A maior categoria de gasto e ${highestExpense.category}, representando ${highestExpense.percentage.toFixed(1)}% dos gastos.`
    );
    lines.push(`Como corte inicial, revise ${highestExpense.category} e busque reduzir de 5% a 10% nessa categoria antes de mexer em despesas essenciais.`);
  }

  if (metrics.debtRate > 20) {
    lines.push(`Sua taxa de endividamento esta em ${metrics.debtRate.toFixed(1)}%. Priorize quitar dividas caras antes de investir em produtos de maior risco.`);
  }

  const investmentByProfile = {
    conservador: "Para um perfil conservador, priorize Tesouro Selic, CDBs com liquidez diaria e contas que rendem 100% ou mais do CDI.",
    moderado: "Para um perfil moderado, depois da reserva formada, combine renda fixa com uma pequena parcela em ETFs diversificados.",
    arrojado: "Para um perfil arrojado, ainda preserve a reserva em renda fixa e limite renda variavel ou cripto a uma parcela controlada da carteira."
  };

  lines.push(investmentByProfile[metrics.riskProfile] || investmentByProfile.conservador);

  return lines.join("\n\n");
}

async function generateAiAdvice(metrics) {
  if (!process.env.OPENROUTER_API_KEY) {
    return {
      source: "local",
      advice: localAdvice(metrics)
    };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": "Consultor Financeiro com IA"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
      messages: [
        {
          role: "user",
          content: buildPrompt(metrics)
        }
      ],
      temperature: 0.4
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(data);
    throw new Error("OpenRouter API error");
  }

  const advice = data.choices?.[0]?.message?.content;

  if (!advice) {
    throw new Error("OpenRouter response without advice");
  }

  return {
    source: "openrouter",
    advice
  };
}

app.post("/api/analyze", async (request, response) => {
  try {
    const metrics = calculateFinancialData(request.body);
    const aiResult = await generateAiAdvice(metrics);

    response.json({
      metrics,
      ...aiResult
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({
      message: "Nao foi possivel gerar a analise financeira agora."
    });
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(publicPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Consultor Financeiro com IA rodando em http://localhost:${port}`);
});
