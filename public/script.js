const form = document.querySelector("#financeForm");
const expensesList = document.querySelector("#expensesList");
const addExpenseButton = document.querySelector("#addExpenseButton");
const scorePreview = document.querySelector("#scorePreview");
const totalExpenses = document.querySelector("#totalExpenses");
const monthlyBalance = document.querySelector("#monthlyBalance");
const spendingRate = document.querySelector("#spendingRate");
const emergencyMonths = document.querySelector("#emergencyMonths");
const debtRate = document.querySelector("#debtRate");
const adviceText = document.querySelector("#adviceText");
const adviceSource = document.querySelector("#adviceSource");
const chartCanvas = document.querySelector("#expensesChart");

let expensesChart;
const chartColors = ["#0f766e", "#2563eb", "#f59e0b", "#db2777", "#7c3aed", "#64748b"];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function collectExpenses() {
  const rows = expensesList.querySelectorAll(".expense-row");
  const expenses = {};

  rows.forEach((row) => {
    const category = row.querySelector('[name="category"]').value.trim();
    const value = Number(row.querySelector('[name="value"]').value || 0);

    if (category) {
      expenses[category] = value;
    }
  });

  return expenses;
}

function buildPayload() {
  const formData = new FormData(form);

  return {
    income: Number(formData.get("income")),
    reserve: Number(formData.get("reserve")),
    age: Number(formData.get("age")),
    monthlyDebt: Number(formData.get("monthlyDebt")),
    stability: formData.get("stability"),
    riskProfile: formData.get("riskProfile"),
    expenses: collectExpenses()
  };
}

function updateMetrics(metrics) {
  scorePreview.textContent = `${metrics.score}/100`;
  totalExpenses.textContent = formatCurrency(metrics.totalExpenses);
  monthlyBalance.textContent = formatCurrency(metrics.monthlyBalance);
  spendingRate.textContent = `${metrics.spendingRate.toFixed(1)}%`;
  emergencyMonths.textContent = `${metrics.emergencyMonths.toFixed(1)} meses`;
  debtRate.textContent = `${metrics.debtRate.toFixed(1)}%`;

  monthlyBalance.classList.toggle("is-negative", metrics.monthlyBalance < 0);
  debtRate.classList.toggle("is-negative", metrics.debtRate > 20);
}

function updateChart(categories) {
  const context = chartCanvas.getContext("2d");
  const pixelRatio = window.devicePixelRatio || 1;
  const width = chartCanvas.clientWidth;
  const height = width > 620 ? 280 : 230 + categories.length * 24;
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  const radius = Math.min(width * 0.28, 96);
  const centerX = Math.max(radius + 20, width * 0.3);
  const centerY = 120;

  chartCanvas.width = width * pixelRatio;
  chartCanvas.height = height * pixelRatio;
  chartCanvas.style.height = `${height}px`;
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  let startAngle = -Math.PI / 2;

  categories.forEach((item, index) => {
    const sliceAngle = total > 0 ? (item.value / total) * Math.PI * 2 : 0;

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    context.closePath();
    context.fillStyle = chartColors[index % chartColors.length];
    context.fill();

    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.stroke();

    startAngle += sliceAngle;
  });

  context.font = "13px Arial, Helvetica, sans-serif";
  context.textBaseline = "middle";

  categories.forEach((item, index) => {
    const x = width > 620 ? width * 0.58 : 24;
    const y = width > 620 ? 46 + index * 30 : 220 + index * 24;
    const label = `${item.category} - ${item.percentage.toFixed(1)}%`;

    context.fillStyle = chartColors[index % chartColors.length];
    context.fillRect(x, y - 7, 14, 14);
    context.fillStyle = "#314138";
    context.fillText(label, x + 22, y);
  });

  expensesChart = true;
}

function addExpenseRow() {
  const row = document.createElement("div");
  row.className = "expense-row";
  row.innerHTML = `
    <input name="category" placeholder="Categoria" aria-label="Categoria" />
    <input name="value" type="number" min="0" step="0.01" placeholder="Valor" aria-label="Valor" />
  `;
  expensesList.appendChild(row);
}

async function analyzeFinances(event) {
  event.preventDefault();

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Analisando...";
  adviceText.textContent = "Calculando indicadores e consultando a API...";
  adviceSource.textContent = "Processando";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildPayload())
    });

    if (!response.ok) {
      throw new Error("Falha ao analisar financas.");
    }

    const result = await response.json();

    updateMetrics(result.metrics);
    updateChart(result.metrics.categoryPercentages);
    adviceText.textContent = result.advice;
    adviceSource.textContent = result.source === "openrouter" ? "OpenRouter API" : "Analise local";
  } catch (error) {
    adviceText.textContent = "Nao foi possivel gerar a analise agora. Verifique se o servidor esta rodando.";
    adviceSource.textContent = "Erro";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Analisar financas";
  }
}

addExpenseButton.addEventListener("click", addExpenseRow);
form.addEventListener("submit", analyzeFinances);
