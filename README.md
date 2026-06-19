# Consultor Financeiro com IA

Aplicacao web que analisa a situacao financeira do usuario, calcula indicadores no backend e gera recomendacoes usando IA pelo OpenRouter.

## Funcionalidades

- Entrada de salario, reserva, idade, dividas mensais, estabilidade, perfil de risco e gastos por categoria.
- Calculo de total de gastos, sobra mensal, percentual por categoria, taxa de endividamento, meses de reserva e score financeiro.
- Endpoint `POST /api/analyze` em Node.js + Express.
- Analise por LLM usando OpenRouter com o modelo `openai/gpt-oss-120b:free`.
- Resposta local automatica quando a chave nao estiver configurada.
- Grafico de pizza em canvas com a distribuicao dos gastos.

## Como rodar

```bash
npm install
npm run dev
```

Depois acesse:

```text
http://localhost:3000
```

Para usar a IA, crie um arquivo `.env` baseado em `.env.example`:

```env
OPENROUTER_API_KEY=sua_chave
OPENROUTER_MODEL=openai/gpt-oss-120b:free
OPENROUTER_SITE_URL=http://localhost:3000
PORT=3000
```

## Objetivo academico

O projeto demonstra integracao entre backend, frontend e API de inteligencia artificial. As contas financeiras ficam no codigo, enquanto a IA interpreta os indicadores e gera aconselhamento em linguagem natural.

O score financeiro considera reserva de emergencia, taxa de poupanca, endividamento e estabilidade financeira.
