# Finora - Consultor Financeiro com IA

Finora e um projeto academico da disciplina Fundamentos de Inteligencia Artificial. A aplicacao recebe dados financeiros do usuario, organiza extratos bancarios, calcula indicadores e usa um LLM via OpenRouter para gerar uma analise educacional em portugues.

O objetivo nao e substituir uma consultoria financeira profissional. O foco do projeto e demonstrar uma aplicacao real usando IA generativa, backend, frontend, banco de dados e uma proposta clara de uso.

## O Que O Projeto Faz

- Gera uma analise financeira personalizada com IA a partir de renda, reserva, dividas, gastos, perfil de risco e objetivos.
- Usa o modelo `openai/gpt-oss-120b:free` pelo OpenRouter.
- Mantem a chave da IA no backend, dentro do arquivo `.env`.
- Permite importar extratos em PDF ou imagem.
- Usa leitura de PDF com `pdfjs-dist` e OCR com `tesseract.js` para imagens.
- Permite revisar transacoes antes de salvar.
- Salva categorias, importacoes e transacoes em PostgreSQL quando `DATABASE_URL` esta configurada.
- Funciona sem PostgreSQL usando armazenamento em memoria para testes e apresentacoes.
- Mostra dashboard financeiro com entradas, saidas, saldo, categorias e graficos.
- Permite gerar diagnosticos de importacoes especificas.

## Areas Da Aplicacao

### Consultoria com IA

Endereco:

```text
http://localhost:3000
```

Nesta tela o usuario preenche:

- salario mensal;
- reserva atual;
- idade;
- dividas mensais;
- estabilidade da renda;
- perfil de investimento;
- gastos mensais por categoria;
- objetivos principais;
- detalhes ou preocupacoes financeiras.

Depois de enviar, o sistema monta um prompt financeiro resumido, chama `/api/llm` no backend e exibe a resposta da IA em secoes como diagnostico, pontos de atencao, caminhos de investimento, plano de acao e proximos passos.

### Painel financeiro

Endereco:

```text
http://localhost:3000/painel
```

No painel existem duas abas principais:

- **Importacoes:** leitura de extratos, revisao de transacoes e historico de arquivos confirmados.
- **Categorias:** cadastro e manutencao de categorias de entrada e saida.

Depois que existem transacoes salvas no banco, o painel tambem alimenta os graficos e os resumos usados pela consultoria.

## Tecnologias Usadas

- Node.js 22.13 ou superior
- Express
- Next.js
- React
- TypeScript
- Tailwind CSS
- PostgreSQL opcional para persistencia dos dados
- OpenRouter
- pdfjs-dist
- tesseract.js

## Requisitos Para Rodar

Antes de iniciar o projeto, instale:

- Node.js 22.13 ou superior: https://nodejs.org
- PostgreSQL local ou um banco online, como Neon, Supabase ou Render, se quiser salvar os dados de forma persistente.

Confira se os programas estao instalados:

```bash
node -v
npm -v
git --version
```


## Como Instalar As Dependencias

Na raiz do projeto, execute:

```bash
npm install
```

Se quiser instalar exatamente as versoes travadas no `package-lock.json`, use:

```bash
npm ci
```

## Configuracao Do Ambiente

Crie um arquivo chamado `.env` na raiz do projeto.

Voce pode usar este modelo:

```env
OPENROUTER_API_KEY=sua_chave_openrouter_aqui
OPENROUTER_MODEL=openai/gpt-oss-120b:free
OPENROUTER_SITE_URL=http://localhost:3000
PORT=3000
# Opcional. Sem DATABASE_URL, o app usa armazenamento em memoria.
# DATABASE_URL=postgresql://usuario:senha@host:5432/banco
```

Variaveis:

| Variavel | Obrigatoria | Para que serve |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Sim | Chave da API do OpenRouter usada pelo backend para chamar o modelo. |
| `OPENROUTER_MODEL` | Nao | Modelo de IA. Se ficar vazio, o sistema usa `openai/gpt-oss-120b:free`. |
| `OPENROUTER_SITE_URL` | Nao | URL enviada ao OpenRouter como origem da aplicacao. |
| `PORT` | Nao | Porta do servidor local. O padrao e `3000`. |
| `DATABASE_URL` | Nao | String de conexao do PostgreSQL. Sem ela, o app usa armazenamento em memoria. |

### Modo sem PostgreSQL

Se voce nao configurar `DATABASE_URL`, o projeto abre normalmente. Nesse caso:

- categorias, importacoes e transacoes ficam em memoria;
- os dados somem quando o servidor e reiniciado;
- a consultoria com IA continua funcionando;
- o painel, categorias e importacoes continuam disponiveis para teste.

Use PostgreSQL quando quiser manter historico entre execucoes.


## Como Abrir O Projeto

Depois de instalar dependencias e criar `.env`, rode:

```bash
npm start
```

Ou, em desenvolvimento:

```bash
npm run dev
```

Quando o terminal mostrar que o servidor iniciou, abra o navegador em:

```text
http://localhost:3000
```

Outros enderecos uteis:

```text
http://localhost:3000/painel
http://localhost:3000/api/status
```

Se voce mudou a variavel `PORT`, troque `3000` pela porta configurada.

## Como Usar A Consultoria Com IA

1. Abra `http://localhost:3000`.
2. Preencha os dados do formulario financeiro.
3. Se quiser, selecione faturas ja importadas para preencher parte dos valores automaticamente.
4. Cadastre ou ajuste os gastos mensais.
5. Escolha pelo menos um objetivo principal.
6. Clique em **Analisar minhas financas**.
7. Aguarde a resposta da IA.
8. Veja o diagnostico no dashboard da propria pagina.
9. Use **Exportar PDF** para gerar um relatorio imprimivel.

O sistema envia para a IA somente um resumo financeiro, nao o arquivo completo do extrato.

## Como Usar A Importacao De Extratos

1. Abra `http://localhost:3000/painel`.
2. Entre em **Importacoes**.
3. Escolha o banco ou formato do extrato.
4. Selecione um PDF ou imagem.
5. Clique para ler as transacoes.
6. Revise data, descricao, tipo, categoria, valor e confianca.
7. Marque itens incorretos como `Ignorar`, se necessario.
8. Confirme a importacao.
9. O extrato salvo passa a aparecer no historico e pode alimentar o dashboard.

Arquivos PDF sao lidos no navegador com `pdfjs-dist`. Imagens usam OCR com `tesseract.js`.

## Como Usar Categorias

1. Abra `http://localhost:3000/painel#categorias`.
2. Cadastre categorias de entrada ou saida.
3. Escolha nome, tipo e cor.
4. Use essas categorias para classificar transacoes importadas.
5. Edite ou desative categorias quando necessario.

Categorias corretas deixam os graficos e diagnosticos mais uteis.

## Scripts Disponiveis

| Comando | Funcao |
| --- | --- |
| `npm run dev` | Inicia o servidor em modo desenvolvimento. |
| `npm start` | Inicia o servidor. |
| `npm run build` | Gera o build do Next.js. |
| `npm run lint` | Executa a verificacao de padronizacao do codigo. |

## Estrutura Do Projeto

```text
.
|-- server.js                  # Servidor Express, Next.js, PostgreSQL e OpenRouter
|-- package.json               # Dependencias e scripts
|-- package-lock.json          # Versoes travadas das dependencias
|-- public/
|   |-- index.html             # Tela principal da consultoria
|   |-- script.js              # Logica da consultoria, prompt e dashboard da pagina inicial
|   `-- styles.css             # Estilos da pagina inicial
|-- app/
|   |-- layout.tsx             # Layout base do Next.js
|   |-- globals.css            # Estilos globais do painel
|   `-- painel/                # Rotas do painel financeiro
|-- components/
|   |-- categories/            # Tela de categorias
|   |-- charts/                # Graficos
|   |-- dashboard/             # Dashboard financeiro
|   |-- imports/               # Importacao e detalhes dos extratos
|   |-- layout/                # Header e Footer
|   `-- ui/                    # Componentes visuais reutilizaveis
|-- lib/
|   |-- api.ts                 # Cliente das rotas internas
|   |-- importer.ts            # Leitura de PDF/imagem e parser de extrato
|   `-- store.ts               # Calculos, formatadores e utilitarios
|-- types/
|   `-- index.ts               # Tipos compartilhados
`-- db/
    `-- migrations/            # Scripts SQL de migracao
```

## Principais Rotas Da API

| Metodo | Rota | Funcao |
| --- | --- | --- |
| `GET` | `/api/status` | Verifica se a API local esta funcionando. |
| `POST` | `/api/llm` | Envia o prompt financeiro para o OpenRouter. |
| `GET` | `/api/categories` | Lista categorias ativas. |
| `POST` | `/api/categories` | Cria categoria. |
| `PUT` | `/api/categories/:id` | Atualiza categoria. |
| `DELETE` | `/api/categories/:id` | Desativa categoria. |
| `GET` | `/api/imports` | Lista importacoes salvas. |
| `GET` | `/api/imports/:id` | Busca uma importacao com transacoes. |
| `POST` | `/api/imports` | Salva uma importacao revisada. |
| `PUT` | `/api/imports/:id/transactions` | Atualiza categorias das transacoes. |
| `GET` | `/api/transactions` | Lista transacoes salvas. |

## Testes Rapidos

Verificar se o servidor responde:

```bash
curl http://localhost:3000/api/status
```

Testar a IA pelo terminal:

```bash
curl -X POST http://localhost:3000/api/llm \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Tenho renda de R$ 3000 e gastos de R$ 2200. Como organizar minha reserva?\"}"
```

## Problemas Comuns

### O servidor fecha dizendo para configurar OPENROUTER_API_KEY

Crie o arquivo `.env` e informe uma chave valida do OpenRouter.

### Estou sem PostgreSQL. Posso abrir mesmo assim?

Sim. Deixe `DATABASE_URL` vazia ou remova essa variavel do `.env`. O servidor vai avisar que esta usando armazenamento em memoria.

### Erro de conexao com o banco

Confira:

- se a `DATABASE_URL` esta correta;
- se o banco esta ligado;
- se as tabelas foram criadas;
- se o provedor exige SSL;
- se usuario e senha estao corretos.

### A pagina abre, mas as importacoes/categorias nao carregam

Se estiver usando PostgreSQL, isso normalmente indica problema no banco de dados. Teste `http://localhost:3000/api/status` e confira o terminal onde o servidor esta rodando.

Se estiver usando o modo em memoria, reiniciar o servidor apaga as importacoes e categorias criadas durante o teste.

### Erro ao consultar OpenRouter

Possiveis causas:

- chave invalida;
- falta de credito ou limite de uso;
- modelo gratuito indisponivel temporariamente;
- prompt grande demais;
- instabilidade no provedor.

O servidor possui uma resposta local de apoio para alguns casos de limite ou alta demanda, mas a integracao principal e com OpenRouter.

### Porta 3000 em uso

Altere a porta no `.env`:

```env
PORT=3001
OPENROUTER_SITE_URL=http://localhost:3001
```

Depois acesse:

```text
http://localhost:3001
```

### Dependencias com erro

Instale novamente:

```bash
npm install
```

Se ainda falhar, apague `node_modules` e rode `npm install` outra vez.

## Observacoes De Seguranca

- Nao publique `.env`.
- Nao coloque chaves reais no README.
- Nao coloque senha de banco em commits.
- Se uma chave for compartilhada por engano, gere outra no provedor.
- Cada pessoa que baixar o projeto deve criar o proprio `.env`.

## Arquivos Gerados Ou Locais

Estes arquivos e pastas nao precisam ser copiados manualmente:

```text
node_modules/
.next/
.npm-cache/
*.tsbuildinfo
.env
```

Ao baixar em outro computador, basta rodar `npm install` para recriar as dependencias.
