const form = document.querySelector("#financeForm");
const expensesList = document.querySelector("#expensesList");
const addExpenseButton = document.querySelector("#addExpense");
const submitButton = document.querySelector("#submitButton");
const formError = document.querySelector("#formError");
const answer = document.querySelector("#answer");
const answerPlaceholder = document.querySelector("#answerPlaceholder");
const resultStatus = document.querySelector("#resultStatus");
const exportPdfButton = document.querySelector("#exportPdfButton");
const consultingTab = document.querySelector("#consultingTab");
const dashboardTab = document.querySelector("#dashboardTab");
const consultingPanel = document.querySelector("#consultingPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const consultingChart = document.querySelector("#consultingChart");
const chartLegend = document.querySelector("#chartLegend");
const chartHint = document.querySelector("#chartHint");
const dashboardIncome = document.querySelector("#dashboardIncome");
const dashboardExpenses = document.querySelector("#dashboardExpenses");
const dashboardBalance = document.querySelector("#dashboardBalance");
const dashboardRate = document.querySelector("#dashboardRate");
const goalDetailsInput = form.elements.goalDetails;
const importSelect = document.querySelector("#importSelect");
const importSummary = document.querySelector("#importSummary");
const expenseCount = document.querySelector("#expenseCount");
const goalInputs = [...form.querySelectorAll('input[name="goal"]')];
let savedImports = [];
let savedTransactions = [];
let savedExpenseCategories = [];
let savedCategories = [];
let analysisInFlight = false;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const MAX_LLM_PROMPT_CHARS = 1400;

const FINANCIAL_DIAGNOSIS_PROMPT = `
Analise meu momento financeiro com base apenas nos dados abaixo.

Idade: {age} anos
Renda mensal: {income}
Reserva atual: {reserve}
Dividas mensais: {monthlyDebt}
Estabilidade da renda: {stability}
Perfil de investimento: {riskProfile}
Total de gastos: {totalExpenses}
Saldo mensal: {monthlyBalance}
Taxa de gastos: {spendingRate}%
Reserva cobre: {emergencyMonths} meses de gastos

Gastos por categoria, ja somados:
{expenseLines}

Objetivos principais selecionados: {goals}
Detalhe do objetivo: {goalDetails}

Responda curto, em Markdown, sem disclaimer final. Use exatamente:
## Diagnostico
## Pontos de atencao
## Caminhos de investimento personalizados
## Plano de acao
## Proximos passos

Em investimentos, indique no maximo 3 caminhos brasileiros e priorize reserva/dividas antes de renda variavel quando necessario.
Use tabelas pequenas: investimentos com Classe | Motivo | Uso recomendado; plano com Etapa | Acao | Prazo.
Em Proximos passos, escreva exatamente 3 topicos praticos em formato "Acao: detalhe", com metas numericas quando possivel, como economizar um percentual da renda, reduzir uma categoria de gasto ou separar valor para imprevistos.
`.trim();

async function loadImportedStatements() {
  try {
    const [importsResponse, transactionsResponse, categoriesResponse] = await Promise.all([
      fetch("/api/imports"),
      fetch("/api/transactions"),
      fetch("/api/categories"),
    ]);
    const importsData = await importsResponse.json();
    const transactionsData = await transactionsResponse.json();
    const categoriesData = await categoriesResponse.json();
    if (!importsResponse.ok) throw new Error(importsData.erro || "Nao foi possivel carregar as importacoes.");
    if (!transactionsResponse.ok) throw new Error(transactionsData.erro || "Nao foi possivel carregar as transacoes.");
    if (!categoriesResponse.ok) throw new Error(categoriesData.erro || "Nao foi possivel carregar as categorias.");

    savedImports = importsData;
    savedTransactions = transactionsData;
    savedCategories = categoriesData;
    savedExpenseCategories = buildExpenseCategories(categoriesData, transactionsData);
    renderImportOptions();
    refreshExpenseCategoryDropdowns();
    updateExpenseCount();
    const financialData = collectFinancialData();
    renderDashboardMetrics(financialData);
    renderConsultingChart(financialData);
  } catch (error) {
    importSelect.innerHTML = '<option value="">Importacoes indisponiveis</option>';
    importSelect.disabled = true;
    importSummary.textContent = error.message || "Nao foi possivel carregar as importacoes.";
  }
}

function setActiveWorkspaceTab(tabName) {
  const showDashboard = tabName === "dashboard";
  consultingTab.classList.toggle("active", !showDashboard);
  dashboardTab.classList.toggle("active", showDashboard);
  consultingTab.setAttribute("aria-selected", String(!showDashboard));
  dashboardTab.setAttribute("aria-selected", String(showDashboard));
  consultingPanel.hidden = showDashboard;
  dashboardPanel.hidden = !showDashboard;
  consultingPanel.classList.toggle("active", !showDashboard);
  dashboardPanel.classList.toggle("active", showDashboard);
  if (showDashboard) {
    renderDashboardMetrics(collectFinancialData());
    renderConsultingChart(collectFinancialData());
  }
}

function buildExpenseCategories(categories, transactions) {
  const names = new Set();
  categories
    .filter((item) => item.type === "expense")
    .forEach((item) => names.add(item.name));
  transactions
    .filter((item) => item.type === "expense" && item.category)
    .forEach((item) => names.add(item.category));
  return [...names].sort((first, second) => first.localeCompare(second, "pt-BR"));
}

function renderImportOptions() {
  importSelect.innerHTML = "";
  if (!savedImports.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Nenhuma importacao encontrada";
    importSelect.appendChild(placeholder);
  }

  savedImports.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = [item.fileName, item.statementMonth ? monthLabel(item.statementMonth) : ""].filter(Boolean).join(" - ");
    importSelect.appendChild(option);
  });

  importSelect.disabled = !savedImports.length;
  importSummary.textContent = savedImports.length
    ? "Selecione uma ou mais faturas para preencher salario, dividas e reserva."
    : "Confirme uma importacao na pagina Importacoes para usar este preenchimento.";
}

function setMoneyValue(name, value) {
  form.elements[name].value = Math.max(value, 0).toFixed(2);
}

function replaceExpenses(expensesByCategory) {
  expensesList.innerHTML = "";
  if (!expensesByCategory.length) {
    addExpenseRow("", 0, {});
    updateExpenseCount();
    return;
  }

  expensesByCategory.forEach((item) => addExpenseRow(item.category, item.value, item));
  updateExpenseCount();
}

function updateExpenseCount() {
  if (!expenseCount) return;
  const count = expensesList.querySelectorAll(".expense-row").length;
  expenseCount.textContent = `${count} gasto${count === 1 ? "" : "s"} exibido${count === 1 ? "" : "s"}`;
}

function createExpenseCategoryDropdown(selectedCategory = "") {
  const select = document.createElement("select");
  select.dataset.category = "";
  select.setAttribute("aria-label", "Categoria da despesa");
  select.required = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = savedExpenseCategories.length ? "Selecione uma categoria" : "Nenhuma categoria cadastrada";
  select.appendChild(placeholder);

  if (selectedCategory && !savedExpenseCategories.includes(selectedCategory)) {
    const option = document.createElement("option");
    option.value = selectedCategory;
    option.textContent = selectedCategory;
    select.appendChild(option);
  }

  savedExpenseCategories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  select.value = selectedCategory;
  select.disabled = !savedExpenseCategories.length && !selectedCategory;
  return select;
}

function refreshExpenseCategoryDropdowns() {
  expensesList.querySelectorAll(".expense-row").forEach((row) => {
    const currentField = row.querySelector("[data-category]");
    if (!currentField) return;
    const selectedCategory = currentField?.value || "";
    const dropdown = createExpenseCategoryDropdown(selectedCategory);
    currentField.replaceWith(dropdown);
  });
}

function selectedImportIds() {
  return [...importSelect.selectedOptions].map((option) => option.value).filter(Boolean);
}

function selectedImports() {
  const ids = new Set(selectedImportIds());
  return savedImports.filter((item) => ids.has(item.id));
}

function selectedImportExpenseTransactions() {
  const ids = new Set(selectedImportIds());
  if (!ids.size) return [];
  return savedTransactions.filter((item) => ids.has(item.importId) && item.type === "expense");
}

function applyImportedStatement(importIds = selectedImportIds()) {
  const ids = new Set(importIds);
  const imports = savedImports.filter((item) => ids.has(item.id));
  if (!imports.length) {
    importSummary.textContent = savedImports.length
      ? "Selecione uma ou mais faturas para preencher salario, dividas e reserva."
      : "Confirme uma importacao na pagina Importacoes para usar este preenchimento.";
    return;
  }

  const transactions = savedTransactions.filter((item) => ids.has(item.importId));
  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const expenseTransactions = transactions
    .filter((item) => item.type === "expense")
    .sort((first, second) => {
      const firstDate = String(first.date || "").split("/").reverse().join("-");
      const secondDate = String(second.date || "").split("/").reverse().join("-");
      return firstDate.localeCompare(secondDate) || String(first.description || "").localeCompare(String(second.description || ""), "pt-BR");
    })
    .map((item) => ({
      category: item.category || "Sem categoria",
      value: Number(item.amount),
      description: item.description,
      date: item.date,
    }));

  setMoneyValue("income", income);
  setMoneyValue("monthlyDebt", expenses);
  setMoneyValue("reserve", income - expenses);
  replaceExpenses(expenseTransactions);
  importSummary.textContent = `${imports.length} fatura${imports.length === 1 ? "" : "s"} selecionada${imports.length === 1 ? "" : "s"}: ${expenseTransactions.length} transacoes de saida, entradas ${currencyFormatter.format(income)}, saidas ${currencyFormatter.format(expenses)}, sobra ${currencyFormatter.format(income - expenses)}.`;
  const financialData = collectFinancialData();
  renderDashboardMetrics(financialData);
  renderConsultingChart(financialData);
}

function addExpenseRow(category = "", value = 0, details = {}) {
  const row = document.createElement("div");
  row.className = "expense-row";
  const categoryDropdown = createExpenseCategoryDropdown(category);
  const categoryCell = document.createElement("div");
  categoryCell.className = "expense-category-cell";
  categoryCell.appendChild(categoryDropdown);
  if (details.description || details.date) {
    const meta = document.createElement("small");
    meta.textContent = [details.date, details.description].filter(Boolean).join(" - ");
    meta.title = meta.textContent;
    categoryCell.appendChild(meta);
  }
  const moneyField = document.createElement("span");
  moneyField.className = "money-field";
  moneyField.innerHTML = `
    <small>R$</small>
    <input data-value type="number" min="0" step="0.01" value="0" aria-label="Valor da despesa" required />`;
  row.append(categoryCell, moneyField);
  expensesList.appendChild(row);
  if (category) {
    row.querySelector("[data-value]").value = Number(value || 0).toFixed(2);
  }
  updateExpenseCount();
  if (details.focus) row.querySelector("[data-category]").focus();
}

function collectFinancialData() {
  const formData = new FormData(form);
  const expenses = [...expensesList.querySelectorAll(".expense-row")].map((row) => ({
    category: row.querySelector("[data-category]").value.trim(),
    value: Number(row.querySelector("[data-value]").value || 0),
  })).filter((item) => item.category);
  const goals = formData.getAll("goal").map((goal) => String(goal).trim()).filter(Boolean);

  const income = Number(formData.get("income"));
  const reserve = Number(formData.get("reserve"));
  const monthlyDebt = Number(formData.get("monthlyDebt"));
  const totalExpenses = expenses.reduce((sum, item) => sum + item.value, 0);
  const monthlyBalance = income - totalExpenses;
  const spendingRate = income > 0 ? totalExpenses / income * 100 : 0;
  const emergencyMonths = totalExpenses > 0 ? reserve / totalExpenses : 0;

  return {
    income,
    reserve,
    age: Number(formData.get("age")),
    monthlyDebt,
    stability: formData.get("stability"),
    riskProfile: formData.get("riskProfile"),
    goals,
    goalDetails: String(formData.get("goalDetails") || "").trim(),
    expenses,
    totalExpenses,
    monthlyBalance,
    spendingRate,
    emergencyMonths,
  };
}

function truncatePromptField(text, maxLength) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function summarizeExpensesForPrompt(expenses) {
  const totalsByCategory = new Map();
  expenses.forEach((item) => {
    const category = item.category || "Sem categoria";
    totalsByCategory.set(category, (totalsByCategory.get(category) || 0) + Number(item.value || 0));
  });

  const ranked = [...totalsByCategory.entries()]
    .map(([category, value]) => ({ category, value }))
    .filter((item) => item.value > 0)
    .sort((first, second) => second.value - first.value);

  if (!ranked.length) return "- Nenhuma despesa informada";

  const visible = ranked.slice(0, 8);
  const hiddenTotal = ranked.slice(8).reduce((sum, item) => sum + item.value, 0);
  const lines = visible.map((item) => `- ${item.category}: ${currencyFormatter.format(item.value)}`);
  if (hiddenTotal > 0) lines.push(`- Outras categorias: ${currencyFormatter.format(hiddenTotal)}`);
  return lines.join("\n");
}

function buildPrompt(data) {
  const expenseLines = summarizeExpensesForPrompt(data.expenses);
  const prompt = FINANCIAL_DIAGNOSIS_PROMPT
    .replace("{age}", data.age)
    .replace("{income}", currencyFormatter.format(data.income))
    .replace("{reserve}", currencyFormatter.format(data.reserve))
    .replace("{monthlyDebt}", currencyFormatter.format(data.monthlyDebt))
    .replace("{stability}", data.stability)
    .replace("{riskProfile}", data.riskProfile)
    .replace("{totalExpenses}", currencyFormatter.format(data.totalExpenses))
    .replace("{monthlyBalance}", currencyFormatter.format(data.monthlyBalance))
    .replace("{spendingRate}", data.spendingRate.toFixed(1))
    .replace("{emergencyMonths}", data.emergencyMonths.toFixed(1))
    .replace("{expenseLines}", truncatePromptField(expenseLines, 360))
    .replace("{goals}", truncatePromptField(data.goals.join("; ") || "nenhum", 140))
    .replace("{goalDetails}", truncatePromptField(data.goalDetails || "nao informado", 160));

  return prompt.slice(0, MAX_LLM_PROMPT_CHARS);
}

function removeAiDisclaimer(text) {
  return String(text)
    .replace(/\*?Esta analise nao substitui a consultoria de um profissional de financas\. Avalie sempre suas condicoes especificas antes de tomar decisoes\.\*?/gi, "")
    .replace(/\*?Esta análise não substitui a consultoria de um profissional de finanças\. Avalie sempre suas condições específicas antes de tomar decisões\.\*?/gi, "")
    .trim();
}

function renderMetrics(data) {
  renderDashboardMetrics(data);
  renderConsultingChart(data);
}

function removeProfessionalDisclaimer(text) {
  const disclaimer = "esta analise nao substitui a consultoria de um profissional de financas";
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(disclaimer))
    .join("\n")
    .trim();
}

function renderDashboardMetrics(data) {
  dashboardIncome.textContent = currencyFormatter.format(data.income);
  dashboardExpenses.textContent = currencyFormatter.format(data.totalExpenses);
  dashboardBalance.textContent = currencyFormatter.format(data.monthlyBalance);
  dashboardRate.textContent = `${data.spendingRate.toFixed(1)}%`;
  dashboardBalance.classList.toggle("negative", data.monthlyBalance < 0);
}

function transactionMonth(transaction) {
  if (transaction.statementMonth) return transaction.statementMonth;
  const [day, month, year] = String(transaction.date || "").split("/").map(Number);
  if (!day || !month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function transactionDate(transaction) {
  const [day, month, year] = String(transaction.date || "").split("/").map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

function daysBetween(startDate, endDate) {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.max(0, Math.round((end - start) / dayMs));
}

function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function categoryColor(name, index = 0) {
  const saved = savedCategories.find((item) => item.name === name);
  const fallback = ["#6d5dfc", "#00a878", "#7b61ff", "#ef3e8b", "#0ea5e9", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#f97316"];
  return saved?.color || fallback[index % fallback.length];
}

function setupChartCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const parentWidth = consultingChart.parentElement?.clientWidth || 640;
  const width = consultingChart.clientWidth || parentWidth;
  const height = 420;
  consultingChart.width = width * ratio;
  consultingChart.height = height * ratio;
  consultingChart.style.height = `${height}px`;
  const context = consultingChart.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = "12px Arial";
  context.lineCap = "round";
  context.lineJoin = "round";
  return { context, width, height };
}

function niceMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  return Math.ceil(value / magnitude * 1.15) * magnitude;
}

function drawChartGrid(context, bounds, max) {
  const { left, right, top, areaH, width } = bounds;
  context.strokeStyle = "#e8e3d8";
  context.fillStyle = "#607169";
  context.lineWidth = 1;
  context.setLineDash([4, 5]);
  context.textAlign = "right";
  for (let index = 0; index <= 4; index += 1) {
    const value = max - max * index / 4;
    const y = top + areaH * index / 4;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(width - right, y);
    context.stroke();
    context.fillText(currencyFormatter.format(value), left - 10, y + 4);
  }
  context.setLineDash([]);
  context.strokeStyle = "#d8d2c4";
  context.beginPath();
  context.moveTo(left, top + areaH);
  context.lineTo(width - right, top + areaH);
  context.stroke();
}

function drawSmoothLine(context, points) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y);
  else {
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midX = (current.x + next.x) / 2;
      context.bezierCurveTo(midX, current.y, midX, next.y, next.x, next.y);
    }
  }
  context.stroke();
}

function renderLegend(series) {
  chartLegend.innerHTML = "";
  series.forEach((item) => {
    const label = document.createElement("span");
    label.innerHTML = `<i style="background:${item.color}"></i>${item.name}`;
    chartLegend.appendChild(label);
  });
}

function renderLineChart(series, labels, formatLabel = monthLabel) {
  const { context, width, height } = setupChartCanvas();
  const bounds = { left: 74, right: 30, top: 30, areaH: 332, width };
  const areaW = Math.max(width - bounds.left - bounds.right, 1);
  const max = niceMax(Math.max(...series.flatMap((item) => item.values), 1));
  drawChartGrid(context, bounds, max);

  series.forEach((item) => {
    const points = item.values.map((value, index) => ({
      x: bounds.left + (labels.length === 1 ? areaW / 2 : index * areaW / (labels.length - 1)),
      y: bounds.top + bounds.areaH - value / max * bounds.areaH,
      changed: item.changedIndexes?.has(index) ?? true,
    }));
    context.strokeStyle = item.color;
    context.lineWidth = 3;
    drawSmoothLine(context, points);
    points.filter((point, index) => point.changed || index === points.length - 1).forEach((point) => {
      context.beginPath();
      context.fillStyle = "#fffdf8";
      context.strokeStyle = item.color;
      context.lineWidth = 2;
      context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  });

  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((label, index) => {
    if (index !== 0 && index !== labels.length - 1 && index % labelStep !== 0) return;
    const x = bounds.left + (labels.length === 1 ? areaW / 2 : index * areaW / (labels.length - 1));
    context.fillStyle = "#607169";
    context.textAlign = "center";
    context.fillText(formatLabel(label), x, height - 20);
  });
  renderLegend(series);
}

function renderBarChart(expenses) {
  const { context, width, height } = setupChartCanvas();
  const bounds = { left: 74, right: 30, top: 30, areaH: 332, width };
  const areaW = Math.max(width - bounds.left - bounds.right, 1);
  const items = expenses.filter((item) => item.value > 0).slice(0, 10).map((item, index) => ({ ...item, name: item.category, color: categoryColor(item.category, index) }));
  const max = niceMax(Math.max(...items.map((item) => item.value), 1));
  drawChartGrid(context, bounds, max);

  const gap = Math.max(12, Math.min(22, areaW / Math.max(items.length, 1) * .16));
  const barW = Math.max(20, (areaW - gap * Math.max(items.length - 1, 0)) / Math.max(items.length, 1));
  items.forEach((item, index) => {
    const h = item.value / max * bounds.areaH;
    const x = bounds.left + index * (barW + gap);
    const y = bounds.top + bounds.areaH - h;
    context.fillStyle = item.color;
    context.beginPath();
    context.roundRect(x, y, barW, h, 8);
    context.fill();
    context.fillStyle = "#607169";
    context.textAlign = "center";
    context.fillText(item.name.length > 10 ? `${item.name.slice(0, 9)}...` : item.name, x + barW / 2, height - 20);
  });
  renderLegend(items);
}

function renderExpenseLineChart(expenses) {
  const totalsByCategory = new Map();
  expenses.forEach((item) => {
    const category = item.category || "Outros";
    totalsByCategory.set(category, (totalsByCategory.get(category) || 0) + Number(item.value || 0));
  });

  const items = [...totalsByCategory.entries()]
    .map(([category, value], index) => ({ category, value, color: categoryColor(category, index) }))
    .filter((item) => item.value > 0)
    .slice(0, 10);

  const labels = items.map((item) => item.category);
  const changedIndexes = new Set(labels.map((_, index) => index));
  const series = [{
    name: "Gastos por categoria",
    color: "#6d5dfc",
    values: items.map((item) => item.value),
    changedIndexes,
  }];

  renderLineChart(series, labels, (label) => String(label).length > 10 ? `${String(label).slice(0, 9)}...` : label);
}

function buildMonthlyCumulativeSeries(datedTransactions, grouping) {
  const labels = [...new Set(datedTransactions.map(transactionMonth).filter(Boolean))].sort();
  const valuesByGroup = new Map();
  datedTransactions.forEach((item) => {
    const month = transactionMonth(item);
    if (!month) return;
    const group = grouping(item);
    if (!valuesByGroup.has(group)) valuesByGroup.set(group, new Map());
    const valuesByMonth = valuesByGroup.get(group);
    valuesByMonth.set(month, (valuesByMonth.get(month) || 0) + Number(item.amount));
  });

  const series = [...valuesByGroup.entries()].map(([name, valuesByMonth], index) => {
    let runningTotal = 0;
    const changedIndexes = new Set();
    const values = labels.map((label, labelIndex) => {
      const monthValue = valuesByMonth.get(label) || 0;
      if (monthValue > 0) changedIndexes.add(labelIndex);
      runningTotal += monthValue;
      return runningTotal;
    });
    return { name, color: categoryColor(name, index), values, total: runningTotal, changedIndexes };
  }).filter((item) => item.total > 0).sort((first, second) => second.total - first.total).slice(0, 10);

  return { labels, series, interval: "monthly" };
}

function buildDailyCumulativeSeries(transactions, grouping) {
  const datedTransactions = transactions.map((item) => ({ ...item, parsedDate: transactionDate(item) })).filter((item) => item.parsedDate);
  if (!datedTransactions.length) return { labels: [], series: [] };
  const startDatesByImport = new Map();
  datedTransactions.forEach((item) => {
    const current = startDatesByImport.get(item.importId);
    if (!current || item.parsedDate < current) startDatesByImport.set(item.importId, item.parsedDate);
  });

  const valuesByGroup = new Map();
  const days = new Set([0]);
  datedTransactions.forEach((item) => {
    const startDate = startDatesByImport.get(item.importId);
    const day = daysBetween(startDate, item.parsedDate) + 1;
    days.add(day);
    const group = grouping(item);
    if (!valuesByGroup.has(group)) valuesByGroup.set(group, new Map());
    const valuesByDay = valuesByGroup.get(group);
    valuesByDay.set(day, (valuesByDay.get(day) || 0) + Number(item.amount));
  });

  const maxDay = Math.max(...days);
  if (maxDay > 45) return buildMonthlyCumulativeSeries(datedTransactions, grouping);

  const labels = [...days].sort((first, second) => first - second).map(String);
  const series = [...valuesByGroup.entries()].map(([name, valuesByDay], index) => {
    let runningTotal = 0;
    const changedIndexes = new Set();
    const values = labels.map((label, labelIndex) => {
      const dayValue = valuesByDay.get(Number(label)) || 0;
      if (dayValue > 0) changedIndexes.add(labelIndex);
      runningTotal += dayValue;
      return runningTotal;
    });
    return { name, color: categoryColor(name, index), values, total: runningTotal, changedIndexes };
  }).filter((item) => item.total > 0).sort((first, second) => second.total - first.total).slice(0, 10);

  return { labels, series, interval: "daily" };
}

function renderConsultingChart(financialData) {
  if (!consultingChart) return;
  const expenseTransactions = selectedImportExpenseTransactions();
  if (expenseTransactions.length) {
    const imports = selectedImports();
    const multipleImports = imports.length > 1;
    const importNames = new Map(imports.map((item, index) => [item.id, item.fileName || `Fatura ${index + 1}`]));
    const dailyData = buildDailyCumulativeSeries(
      expenseTransactions,
      multipleImports ? (item) => item.importId : (item) => item.category || "Outros",
    );
    const series = multipleImports
      ? dailyData.series.map((item) => ({ ...item, name: importNames.get(item.name) || item.name }))
      : dailyData.series;
    if (!dailyData.labels.length || !series.length) {
      chartHint.textContent = "Nao foi possivel ler datas validas nas faturas; exibindo linha por categoria.";
      renderExpenseLineChart(financialData.expenses);
      return;
    }
    chartHint.textContent = multipleImports
      ? `Comparando ${imports.length} faturas selecionadas ${dailyData.interval === "monthly" ? "por mes" : "a partir do Dia 0"}.`
      : `Evolucao acumulada por categoria ${dailyData.interval === "monthly" ? "por mes" : "a partir do Dia 0 da fatura selecionada"}.`;
    renderLineChart(series, dailyData.labels, dailyData.interval === "monthly" ? monthLabel : (label) => `Dia ${label}`);
    return;
  }

  chartHint.textContent = selectedImportIds().length
    ? "As faturas selecionadas nao possuem saidas para desenhar; exibindo linha com os gastos preenchidos."
    : "Grafico de linha gerado a partir dos gastos preenchidos no formulario.";
  renderExpenseLineChart(financialData.expenses);
}

function appendInlineText(parent, text) {
  const parts = normalizeAnswerText(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  parts.forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
      return;
    }
    parent.append(document.createTextNode(part));
  });
}

function normalizeAnswerText(text) {
  return String(text).replace(/([0-9])\ufe0f?\u20e3/g, "$1");
}

function normalizeColumnKey(text) {
  return normalizeAnswerText(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function createAnswerSection(title) {
  const section = document.createElement("section");
  section.className = "answer-section";
  const heading = document.createElement("h3");
  const cleanTitle = title.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").replace(/:$/, "");
  heading.textContent = cleanTitle;
  section.dataset.title = cleanTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  section.appendChild(heading);
  answer.appendChild(section);
  return section;
}

function ensureAnswerSection(currentSection) {
  return currentSection || createAnswerSection("Analise financeira");
}

function appendParagraph(section, text) {
  const paragraph = document.createElement("p");
  appendInlineText(paragraph, cleanAnswerLine(text));
  section.appendChild(paragraph);
}

function cleanAnswerLine(line) {
  return line
    .replace(/^>\s*/, "")
    .replace(/^[-–—]{2,}$/, "")
    .trim();
}

function isActionSection(section) {
  const title = section?.dataset.title || "";
  return title.includes("plano") || title.includes("proximos");
}

function isInvestmentSection(section) {
  return (section?.dataset.title || "").includes("caminhos de investimento");
}

function answerToneMeta(level) {
  const levels = {
    positive: { label: "Ponto positivo", summary: "positivos", rank: 0 },
    neutral: { label: "Atencao", summary: "de atencao", rank: 1 },
    negative: { label: "Ponto negativo", summary: "negativos", rank: 2 },
  };
  return levels[level] || levels.neutral;
}

function answerToneFromText(text, section) {
  const value = normalizeColumnKey(text);
  const title = section?.dataset.title || "";
  const positiveTokens = [
    "positivo", "bom", "boa", "otimo", "saudavel", "organizado", "equilibrado", "sobra",
    "saldo positivo", "reserva cobre", "baixo endividamento", "dentro do esperado", "favoravel",
  ];
  const negativeTokens = [
    "negativo", "divida", "dividas", "risco", "alto comprometimento", "gastos altos", "saldo negativo",
    "reserva baixa", "insuficiente", "atraso", "urgente", "prejudica", "compromete", "evite",
    "nao recomendado", "precisa reduzir", "problema",
  ];
  const neutralTokens = [
    "atencao", "moderado", "media", "medio", "revisar", "acompanhar", "avaliar", "ajustar",
    "melhorar", "planejar", "cautela", "pode", "paralelo",
  ];

  if (positiveTokens.some((token) => value.includes(token))) return "positive";
  if (negativeTokens.some((token) => value.includes(token))) return "negative";
  if (neutralTokens.some((token) => value.includes(token))) return "neutral";
  if (title.includes("pontos de atencao")) return "neutral";
  if (title.includes("proximos") || title.includes("plano")) return "positive";
  return "neutral";
}

function cardTitleFromText(text, fallback) {
  const cleanText = cleanAnswerLine(text).replace(/^[-*\s]+/, "").replace(/^\d+[.)]\s*/, "").trim();
  const [firstPart] = cleanText.split(/\s+-\s+|:\s+/);
  const title = firstPart.length > 8 && firstPart.length <= 70 ? firstPart : fallback;
  return title.replace(/^\*\*|\*\*$/g, "").trim();
}

function appendInsightCard(section, text, fallbackTitle = "Resumo") {
  let list = section.lastElementChild;
  if (!list || !list.classList.contains("answer-card-list")) {
    list = document.createElement("div");
    list.className = "answer-card-list";
    section.appendChild(list);
  }

  const cleanText = cleanAnswerLine(text).replace(/^[-*\s]+/, "").replace(/^\d+[.)]\s*/, "");
  const level = answerToneFromText(cleanText, section);
  const meta = answerToneMeta(level);
  const card = document.createElement("article");
  card.className = `answer-visual-card answer-visual-card-${level}`;
  card.dataset.level = level;

  const badge = document.createElement("span");
  badge.className = "answer-visual-badge";
  badge.textContent = meta.label;

  const title = document.createElement("h4");
  title.textContent = cardTitleFromText(cleanText, fallbackTitle);

  const paragraph = document.createElement("p");
  appendInlineText(paragraph, cleanText);

  card.append(badge, title, paragraph);
  list.appendChild(card);
}

function parsePipedActionLine(line) {
  const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean);
  if (!/^\d+[.)]?$/.test(cells[0] || "") || cells.length < 2) return null;

  const titleParts = cells[1].split(/\s+-\s+/);
  const details = [titleParts.slice(1).join(" - "), ...cells.slice(2)].join(" ").replace(/^[-–—]\s*/, "").trim();
  return {
    step: cells[0].replace(/[.)]/g, ""),
    title: titleParts[0].replace(/^\*\*|\*\*$/g, "").trim(),
    details,
  };
}

function actionDetailParts(line) {
  const cleanLine = line.replace(/^[-*]\s*/, "").replace(/^\|/, "").replace(/\|$/, "").trim();
  const cells = cleanLine.split("|").map((cell) => cell.trim()).filter(Boolean);
  return {
    detail: cells[0] || cleanLine,
    meta: cells.slice(1).join(" | "),
  };
}

function appendActionDetail(section, text) {
  const card = section.querySelector(".answer-action-card:last-child");
  if (!card) {
    appendParagraph(section, text);
    return;
  }

  const { detail, meta } = actionDetailParts(text);
  if (detail) {
    const paragraph = document.createElement("p");
    appendInlineText(paragraph, detail);
    card.appendChild(paragraph);
  }
  if (meta) {
    const badge = document.createElement("span");
    badge.className = "answer-action-meta";
    appendInlineText(badge, meta);
    card.appendChild(badge);
  }
}

function appendActionCard(section, action) {
  let list = section.lastElementChild;
  if (!list || !list.classList.contains("answer-action-list")) {
    list = document.createElement("div");
    list.className = "answer-action-list";
    section.appendChild(list);
  }

  const card = document.createElement("article");
  card.className = "answer-action-card answer-action-card-action";
  card.dataset.level = "action";
  const header = document.createElement("div");
  header.className = "answer-action-head";
  const number = document.createElement("span");
  number.className = "answer-action-number";
  number.textContent = action.step;
  const title = document.createElement("h4");
  appendInlineText(title, action.title);
  header.append(number, title);
  const badge = document.createElement("span");
  badge.className = "answer-action-tone";
  badge.textContent = "Etapa do plano";
  card.appendChild(header);
  card.appendChild(badge);
  list.appendChild(card);
  if (action.details) appendActionDetail(section, action.details);
}

function appendListItem(section, text) {
  const match = text.match(/^(\d+)[.)]\s*(.+)$/);
  const shouldUseTable = section.dataset.title?.includes("plano") || section.dataset.title?.includes("proximos");
  if (match && shouldUseTable) {
    appendActionCard(section, { step: match[1], title: match[2], details: "" });
    return;
  }

  appendInsightCard(section, text, "Ponto da analise");
}

function appendStepTableItem(section, step, text) {
  let table = section.lastElementChild;
  if (!table || table.tagName !== "TABLE" || !table.classList.contains("answer-step-table")) {
    table = document.createElement("table");
    table.className = "answer-table answer-step-table";
    appendTableRow(table, ["Etapa", "Acao"], true);
    section.appendChild(table);
  }
  appendTableRow(table, [step, text], false);
}

function appendTableRow(table, cells, isHeader) {
  const tr = document.createElement("tr");
  cells.forEach((cell, index) => {
    const element = document.createElement(isHeader ? "th" : "td");
    const columnKey = isHeader ? normalizeColumnKey(cell) : table.rows[0]?.cells[index]?.dataset.columnKey || "";
    if (isHeader) element.dataset.columnKey = columnKey;
    if (columnKey === "etapa" || columnKey === "item" || (isHeader && columnKey === "classe de investimento")) {
      element.classList.add("answer-table-strong-green");
    }
    appendInlineText(element, String(cell).trim());
    tr.appendChild(element);
  });
  table.appendChild(tr);
}

function investmentLevelFromText(text, index) {
  const value = normalizeColumnKey(text);
  const lowTokens = ["baixa", "baixo", "menos", "evitar", "aguardar", "deve esperar", "nao combina", "nao recomendado", "risco alto"];
  const mediumTokens = ["media", "medio", "moderada", "moderado", "paralelo", "com cautela", "avaliar", "pode fazer sentido"];
  const highTokens = ["alta", "alto", "mais recomendado", "prioridade", "combina bem", "recomendado", "ideal", "primeiro"];

  if (lowTokens.some((token) => value.includes(token))) return "low";
  if (mediumTokens.some((token) => value.includes(token))) return "medium";
  if (highTokens.some((token) => value.includes(token))) return "high";
  return index === 0 ? "high" : index === 1 ? "medium" : "low";
}

function investmentLevelMeta(level) {
  const levels = {
    high: { label: "Mais recomendado", rank: 0 },
    medium: { label: "Recomendacao media", rank: 1 },
    low: { label: "Menos recomendado", rank: 2 },
  };
  return levels[level] || levels.low;
}

function closeInvestmentModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openInvestmentModal(item) {
  let modal = document.querySelector("#investmentModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "investmentModal";
    modal.className = "investment-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="investment-modal-backdrop" data-close-investment-modal></div>
      <section class="investment-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="investmentModalTitle">
        <button class="investment-modal-close" type="button" aria-label="Fechar explicacao" data-close-investment-modal>x</button>
        <span class="investment-modal-badge"></span>
        <h3 id="investmentModalTitle"></h3>
        <div class="investment-modal-content"></div>
      </section>
    `;
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-investment-modal]")) closeInvestmentModal(modal);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("open")) closeInvestmentModal(modal);
    });
    document.body.appendChild(modal);
  }

  const meta = investmentLevelMeta(item.level);
  modal.querySelector(".investment-modal-dialog").dataset.level = item.level;
  modal.querySelector(".investment-modal-badge").textContent = meta.label;
  modal.querySelector("#investmentModalTitle").textContent = item.name;
  const content = modal.querySelector(".investment-modal-content");
  content.innerHTML = "";

  [
    ["Por que combina", item.reason],
    ["Uso recomendado", item.recommendation],
  ].forEach(([label, value]) => {
    const block = document.createElement("article");
    const heading = document.createElement("h4");
    const paragraph = document.createElement("p");
    heading.textContent = label;
    appendInlineText(paragraph, value || "Sem detalhe informado pela IA.");
    block.append(heading, paragraph);
    content.appendChild(block);
  });

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector(".investment-modal-close").focus();
}

function appendInvestmentCards(section, rows) {
  const normalizedRows = normalizeTableRows(rows);
  if (normalizedRows.length < 2) return false;

  const dataRows = normalizedRows.slice(1).filter((row) => row.some(Boolean));
  if (!dataRows.length) return false;

  const items = dataRows.map((row, index) => {
    const recommendation = row[2] || row[row.length - 1] || "";
    const level = investmentLevelFromText(`${recommendation} ${row.join(" ")}`, index);
    return {
      name: row[0] || `Caminho ${index + 1}`,
      reason: row[1] || "",
      recommendation,
      level,
      originalIndex: index,
    };
  }).sort((a, b) => {
    const rankDiff = investmentLevelMeta(a.level).rank - investmentLevelMeta(b.level).rank;
    return rankDiff || a.originalIndex - b.originalIndex;
  });

  const list = document.createElement("div");
  list.className = "investment-path-list";
  items.forEach((item) => {
    const meta = investmentLevelMeta(item.level);
    const button = document.createElement("button");
    button.className = `investment-path-card investment-path-card-${item.level}`;
    button.dataset.level = item.level === "high" ? "positive" : item.level === "medium" ? "neutral" : "negative";
    button.type = "button";
    button.addEventListener("click", () => openInvestmentModal(item));

    const badge = document.createElement("span");
    badge.className = "investment-path-badge";
    badge.textContent = meta.label;

    const title = document.createElement("strong");
    appendInlineText(title, item.name);

    const description = document.createElement("span");
    description.className = "investment-path-summary";
    appendInlineText(description, item.recommendation || item.reason || "Clique para ver a explicacao.");

    const hint = document.createElement("span");
    hint.className = "investment-path-hint";
    hint.textContent = "Ver explicacao";

    button.append(badge, title, description, hint);
    list.appendChild(button);
  });

  section.appendChild(list);
  return true;
}

function normalizeTableRows(rows) {
  const usefulRows = rows
    .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 1 || !/^\d+[.)]?$/.test(row[0] || ""));
  if (!usefulRows.length) return [];

  const maxColumns = Math.max(...usefulRows.map((row) => row.length));
  const hasHeader = usefulRows[0].some((cell) => /[a-zA-ZÀ-ÿ]/.test(cell)) && !/^\d+[.)]?$/.test(usefulRows[0][0] || "");
  const headersBySize = {
    2: ["Etapa", "Acao"],
    3: ["Item", "Analise", "Recomendacao"],
  };
  const normalizedRows = usefulRows.map((row) => {
    const nextRow = [...row];
    while (nextRow.length < maxColumns) nextRow.push("");
    return nextRow;
  });

  if (hasHeader) return normalizedRows;
  return [headersBySize[maxColumns] || Array.from({ length: maxColumns }, (_, index) => `Coluna ${index + 1}`), ...normalizedRows];
}

function appendTable(section, rows) {
  const normalizedRows = normalizeTableRows(rows);
  if (!normalizedRows.length) return;
  if (isActionSection(section) && normalizedRows.length === 1 && normalizedRows[0][0]?.toLowerCase() === "etapa") return;
  if (isInvestmentSection(section) && appendInvestmentCards(section, rows)) return;
  const table = document.createElement("table");
  table.className = "answer-table";
  normalizedRows.forEach((row, index) => appendTableRow(table, row, index === 0));
  section.appendChild(table);
}

function updateSectionSummaries() {
  answer.querySelectorAll(".answer-section").forEach((section) => {
    section.querySelector(".answer-section-summary")?.remove();
    const cards = [...section.querySelectorAll(".answer-visual-card, .answer-action-card, .investment-path-card")];
    if (!cards.length) return;

    const counts = cards.reduce((totals, card) => {
      const investmentLevel = card.classList.contains("investment-path-card-high")
        ? "positive"
        : card.classList.contains("investment-path-card-medium")
          ? "neutral"
          : card.classList.contains("investment-path-card-low")
            ? "negative"
            : null;
      const level = card.dataset.level || investmentLevel || "neutral";
      totals[level] = (totals[level] || 0) + 1;
      return totals;
    }, { positive: 0, neutral: 0, negative: 0 });

    const summary = document.createElement("div");
    summary.className = "answer-section-summary";
    const intro = document.createElement("strong");
    intro.textContent = "Resumo";
    summary.appendChild(intro);

    if (isActionSection(section)) {
      const chip = document.createElement("span");
      chip.className = "answer-summary-chip answer-summary-chip-action";
      chip.textContent = `${cards.length} ${cards.length === 1 ? "acao" : "acoes"}`;
      summary.appendChild(chip);
      section.querySelector("h3")?.after(summary);
      return;
    }

    [
      ["positive", counts.positive],
      ["neutral", counts.neutral],
      ["negative", counts.negative],
    ].filter(([, count]) => count > 0).forEach(([level, count]) => {
      const chip = document.createElement("span");
      chip.className = `answer-summary-chip answer-summary-chip-${level}`;
      chip.textContent = `${count} ${answerToneMeta(level).summary}`;
      summary.appendChild(chip);
    });

    section.querySelector("h3")?.after(summary);
  });
}

function isTechnicalNextStep(line, section) {
  const title = section?.dataset.title || "";
  if (!title.includes("proximos passos")) return false;
  const value = normalizeColumnKey(line);
  return [
    "openrouter",
    "modelo gratuito",
    "provedor",
    "provider returned",
    "fallback",
    "relatorio local",
    "tente novamente a analise com ia",
  ].some((token) => value.includes(token));
}

function renderAiAnswer(text) {
  answer.innerHTML = "";
  const lines = removeProfessionalDisclaimer(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => normalizeAnswerText(line).trim())
    .filter(Boolean);

  let currentSection = null;
  let tableRows = [];
  const flushTable = () => {
    if (!tableRows.length) return;
    currentSection = ensureAnswerSection(currentSection);
    appendTable(currentSection, tableRows);
    tableRows = [];
  };

  lines.forEach((line) => {
    const cleanLine = line.replace(/^[-–—]{2,}$/, "").trim();
    if (!cleanLine) return;

    const isTitle = /^#{1,3}\s+/.test(cleanLine) || (/^\*\*.+\*\*$/.test(cleanLine) && cleanLine.length < 90);
    if (isTitle) {
      flushTable();
      currentSection = createAnswerSection(cleanLine);
      return;
    }

    currentSection = ensureAnswerSection(currentSection);
    const normalizedLine = cleanAnswerLine(cleanLine);
    if (isTechnicalNextStep(normalizedLine, currentSection)) return;
    const action = isActionSection(currentSection) ? parsePipedActionLine(normalizedLine) : null;
    if (action) {
      flushTable();
      appendActionCard(currentSection, action);
      return;
    }

    if (/^\|.+\|$/.test(cleanLine)) {
      const cells = cleanLine.split("|").map((cell) => cell.trim()).filter(Boolean);
      const isDivider = cells.every((cell) => /^:?-{2,}:?$/.test(cell));
      if (!isDivider && cells.length) tableRows.push(cells);
      return;
    }

    flushTable();
    currentSection = ensureAnswerSection(currentSection);
    if (isActionSection(currentSection) && /^[-*–—]\s+/.test(cleanLine) && currentSection.querySelector(".answer-action-card")) {
      appendActionDetail(currentSection, cleanLine);
      return;
    }
    if (/^[-*–—]\s+/.test(cleanLine) || /^\d+[.)]\s+/.test(cleanLine)) appendListItem(currentSection, cleanLine);
    else appendInsightCard(currentSection, cleanLine, "Resumo da secao");
  });

  flushTable();
  updateSectionSummaries();
  exportPdfButton.disabled = false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function buildMetricItem(label, value) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function exportAiReportToPdf() {
  if (answer.hidden || !answer.innerHTML.trim()) return;

  const reportWindow = window.open("", "_blank", "width=900,height=700");
  if (!reportWindow) {
    alert("Nao foi possivel abrir a janela de exportacao. Libere pop-ups para gerar o PDF.");
    return;
  }

  const generatedAt = new Date().toLocaleString("pt-BR");
  const metrics = [
    ["Receita", dashboardIncome.textContent],
    ["Total de gastos", dashboardExpenses.textContent],
    ["Saldo mensal", dashboardBalance.textContent],
    ["Taxa de gastos", dashboardRate.textContent],
  ].map(([label, value]) => buildMetricItem(label, value || "-")).join("");

  reportWindow.document.write(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatorio financeiro IA - Finora</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 32px; background: #f4f1e9; color: #183c32; font-family: Arial, Helvetica, sans-serif; }
          main { max-width: 920px; margin: 0 auto; padding: 34px; border: 1px solid #dedbd0; border-radius: 18px; background: #fffdf8; }
          .brand { color: #b68432; font-size: 10px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
          h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
          h1 { margin: 8px 0 8px; font-size: 34px; }
          .meta { margin: 0 0 22px; color: #718078; font-size: 11px; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
          .metrics article { padding: 14px; border: 1px solid #dedbd0; border-radius: 12px; background: #f8f6ef; }
          .metrics span { display: block; color: #718078; font-size: 9px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
          .metrics strong { display: block; margin-top: 8px; font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 400; }
          .answer-section { padding: 0; border: 0; background: transparent; page-break-inside: avoid; }
          .answer-section + .answer-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid #dedbd0; }
          .answer-section h3 { margin: 0 0 10px; color: #164c3d; font-size: 24px; }
          p, li { color: #31483f; font-size: 13px; line-height: 1.75; }
          ol { padding-left: 22px; }
          table { width: 100%; margin: 12px 0; border-collapse: collapse; font-size: 11px; }
          th, td { padding: 10px; border: 1px solid #dedbd0; text-align: left; vertical-align: top; }
          th { background: #e7f0eb; color: #164c3d; font-size: 9px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
          .disclaimer { margin-top: 24px; color: #718078; font-size: 10px; text-align: center; }
          @media print {
            body { padding: 0; background: white; }
            main { border: 0; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <main>
          <p class="brand">Finora</p>
          <h1>Relatorio financeiro da IA</h1>
          <p class="meta">Gerado em ${escapeHtml(generatedAt)}</p>
          <section class="metrics">${metrics}</section>
          <section>${answer.innerHTML}</section>
          <p class="disclaimer">Conteudo educacional. Nao substitui aconselhamento financeiro profissional.</p>
        </main>
        <script>
          addEventListener("load", () => {
            print();
          });
        <\/script>
      </body>
    </html>`);
  reportWindow.document.close();
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? "Consultando a IA..." : "Analisar minhas financas ->";
  if (loading) resultStatus.classList.remove("success", "error");
  resultStatus.textContent = loading ? "Processando" : "Aguardando";
  resultStatus.classList.toggle("loading", loading);
}

async function submitAnalysis(event) {
  event.preventDefault();
  if (analysisInFlight) return;
  formError.hidden = true;
  answer.hidden = true;
  exportPdfButton.disabled = true;

  if (!form.reportValidity()) return;

  const financialData = collectFinancialData();
  if (!financialData.goals.length) {
    formError.textContent = "Selecione pelo menos um objetivo principal.";
    formError.hidden = false;
    goalInputs[0]?.focus();
    return;
  }
  const prompt = buildPrompt(financialData);

  if (prompt.length > MAX_LLM_PROMPT_CHARS) {
    formError.textContent = `O resumo gerado possui ${prompt.length} caracteres. Reduza o objetivo ou a quantidade de categorias.`;
    formError.hidden = false;
    return;
  }

  analysisInFlight = true;
  renderMetrics(financialData);
  setActiveWorkspaceTab("dashboard");
  answerPlaceholder.hidden = true;
  answer.hidden = false;
  answer.textContent = "Consultando a IA...";
  setLoading(true);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 95000);

  try {
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    const rawBody = await response.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      const message = [data.dica, data.detalhe || data.erro || rawBody].filter(Boolean).join(" ");
      throw new Error(message || "Erro desconhecido.");
    }
    renderAiAnswer(data.resposta);
    resultStatus.textContent = data.fallback ? "Analise local" : "Analise concluida";
    resultStatus.classList.add("success");
  } catch (error) {
    answer.textContent = error.name === "AbortError" ? "A consulta demorou demais para responder. Tente novamente ou altere o modelo do OpenRouter." : error.message || "Erro ao conectar com a API local.";
    exportPdfButton.disabled = true;
    resultStatus.textContent = "Erro";
    resultStatus.classList.add("error");
  } finally {
    analysisInFlight = false;
    clearTimeout(timeout);
    submitButton.disabled = false;
    submitButton.textContent = "Analisar minhas financas ->";
    resultStatus.classList.remove("loading");
  }
}

goalDetailsInput.addEventListener("input", () => {
  document.querySelector("#goalCount").textContent = goalDetailsInput.value.length;
});
consultingTab.addEventListener("click", () => setActiveWorkspaceTab("consulting"));
dashboardTab.addEventListener("click", () => setActiveWorkspaceTab("dashboard"));
exportPdfButton.addEventListener("click", exportAiReportToPdf);
addExpenseButton.addEventListener("click", () => {
  addExpenseRow("", 0, { focus: true });
  const financialData = collectFinancialData();
  renderDashboardMetrics(financialData);
  renderConsultingChart(financialData);
});
importSelect.addEventListener("change", () => applyImportedStatement());
form.addEventListener("input", () => {
  const financialData = collectFinancialData();
  renderDashboardMetrics(financialData);
  if (!dashboardPanel.hidden) renderConsultingChart(financialData);
});
form.addEventListener("submit", submitAnalysis);
loadImportedStatements();
