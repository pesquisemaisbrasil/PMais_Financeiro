# Guia de marca para aplicativos

## Pesquise+ / P+Solution Research

Versão prática para produtos digitais e geradores de aplicativos. Elaborado a partir do **BRANDBOOK p+** e dos arquivos oficiais `Logo2025.png` e `Logo2025_branco.png`.

> Este guia traduz o brandbook para interfaces digitais. As cores, a tipografia, o tom de voz, a tagline e as regras do logotipo vêm do documento oficial. Recomendações de componentes, acessibilidade e proporções de uso são uma adaptação específica para aplicativos.

---

## 1. Núcleo da marca

**Propósito:** antecipar o futuro por meio da inteligência aplicada à coleta e análise de dados.

**Missão:** antecipar decisões por meio de soluções inteligentes em coleta de dados.

**Percepção desejada:** marca moderna, estratégica, visionária, confiável e capaz de transformar dados em decisões claras, rápidas e personalizadas.

**Arquétipo:** Sábio, com toque de Herói. A marca demonstra domínio, compartilha conhecimento com clareza, resolve problemas e conduz mudanças.

**Valores:** confiabilidade, compromisso, tecnologia, inovação, inteligência de dados e tranquilidade.

**Palavras-chave:** tranquilidade, inteligência, agilidade, tecnologia, soluções, inovação, clareza, eficiência e futuro.

**Tagline oficial:** `predict the future`

- Sempre em minúsculas.
- Sem pontuação final.
- Não traduzir nem adaptar.
- Usar em Regular ou SemiBold.

## 2. Personalidade e tom de voz

| Característica | Como escrever | Evitar |
|---|---|---|
| Confiável | Falar com propriedade e precisão | Promessas exageradas |
| Ágil | Ser direto, breve e orientado à ação | Rodeios e textos longos sem necessidade |
| Tecnológica | Usar linguagem contemporânea e clara | Excesso de jargão técnico |
| Acessível | Explicar com humanidade e simplicidade | Tom frio, distante ou professoral |
| Inteligente | Relacionar dados a decisões e resultados | Dados sem interpretação |

Exemplos de microcopy:

- “Sua coleta começa hoje.”
- “Dados que antecipam o que vem a seguir.”
- “Tecnologia que transforma dados em ação.”
- “Fique tranquilo. Nós cuidamos disso.”
- “Conte com a gente para uma execução precisa.”

## 3. Paleta institucional

| Token sugerido | Cor | Hex | Papel no aplicativo |
|---|---|---:|---|
| `brand-sky` | Azul Claro | `#009CEF` | Marca, links, foco, destaques e dados ativos |
| `brand-purple` | Roxo | `#6B36F7` | Inteligência, visão de futuro e acentos especiais |
| `brand-green` | Verde Vibrante | `#00C977` | Crescimento, confiança, progresso e estados positivos |
| `brand-deep` | Azul Deep | `#4063EE` | Botão primário, autoridade, navegação ativa |
| `brand-cyan` | Azul Neutro | `#6EC3E4` | Acolhimento, fundos leves e visualizações secundárias |
| `neutral-800` | Cinza Escuro | `#3C3C3C` | Texto, fundos escuros e estrutura |
| `neutral-100` | Cinza Claro | `#E8E8E8` | Fundo, borda e separação |
| `white` | Branco | `#FFFFFF` | Superfícies e respiro |

### Proporção recomendada para interfaces

- 60–70%: branco e cinza claro em fundos e superfícies.
- 20–30%: Azul Deep, Azul Claro e Cinza Escuro para navegação, ações e hierarquia.
- 5–10%: Verde, Roxo e Azul Neutro como acentos, gráficos e sinalização.

Não transformar a tela em um arco-íris. A paleta deve comunicar hierarquia, e não apenas decoração.

### Combinações acessíveis

- Branco sobre `#4063EE`, `#6B36F7` ou `#3C3C3C` atende contraste AA para texto comum.
- `#3C3C3C` sobre `#00C977`, `#6EC3E4`, `#E8E8E8` ou branco atende contraste AA.
- Branco sobre `#009CEF` não atende AA para texto comum; restrinja a títulos grandes ou prefira usar o azul como elemento gráfico.
- Nunca comunique estado apenas por cor. Combine cor com texto, ícone ou padrão.

### Tokens CSS

```css
:root {
  --p-sky: #009cef;
  --p-purple: #6b36f7;
  --p-green: #00c977;
  --p-deep: #4063ee;
  --p-cyan: #6ec3e4;
  --p-charcoal: #3c3c3c;
  --p-gray: #e8e8e8;
  --p-white: #ffffff;

  --color-bg: var(--p-white);
  --color-surface: #ffffff;
  --color-text: var(--p-charcoal);
  --color-border: var(--p-gray);
  --color-primary: var(--p-deep);
  --color-focus: var(--p-sky);
  --color-success: var(--p-green);

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --space-unit: 4px;
}
```

Para erro e alerta, use cores funcionais acessíveis fora da paleta apenas quando necessárias. Elas devem aparecer como sinalização de sistema, nunca como cores de marca.

## 4. Tipografia

**Família oficial:** Open Sans.

- Light: textos extensos e conteúdos explicativos, com cautela em telas pequenas.
- Regular: corpo de texto, formulários, tabelas e mensagens.
- SemiBold: subtítulos, rótulos, navegação e destaques.
- Bold: títulos principais, métricas e chamadas.

Escala recomendada:

| Uso | Tamanho/linha | Peso |
|---|---|---|
| Display | 40/48 | Bold |
| H1 | 32/40 | Bold |
| H2 | 24/32 | Bold |
| H3 | 20/28 | SemiBold |
| Corpo | 16/24 | Regular |
| Corpo compacto | 14/20 | Regular |
| Rótulo | 14/20 | SemiBold |
| Legenda | 12/16 | Regular |

Mantenha corpo de texto com no mínimo 16 px sempre que o contexto permitir. Use no máximo 65–75 caracteres por linha em conteúdos longos.

## 5. Logotipo no ambiente digital

- Use somente os arquivos oficiais fornecidos. Não redesenhe nem peça à IA para recriar o logotipo.
- Em fundo branco ou claro, use a versão principal colorida com lettering escuro.
- Em fundo escuro, use `Logo2025_branco.png`.
- Preserve a proporção original e uma área livre mínima igual à largura da haste vertical do “P”.
- Largura mínima da assinatura completa no digital: **100 px**.
- Em barra de navegação ampla, prefira a assinatura completa.
- Em favicon, avatar, launcher ou espaço quadrado, use somente o isotipo oficial, caso o arquivo correspondente esteja disponível.
- Nunca distorcer, rotacionar, inclinar, separar elementos, alterar cores, adicionar bordas, brilhos ou sombras.
- Não aplicar sobre fotografia ou grafismo de baixo contraste.

## 6. Linguagem visual para aplicativos

O produto deve parecer **tecnológico, limpo, modular, confiável e humano**.

### Layout

- Grade responsiva de 4 px, com espaçamentos principais de 8, 12, 16, 24, 32 e 48 px.
- Muito respiro, alinhamento consistente e hierarquia clara.
- Cards de 12–16 px de raio, borda cinza suave e sombra discreta.
- Cantos arredondados com sobriedade; evitar aparência excessivamente lúdica.
- Preferir uma ação primária evidente por tela.

### Componentes

- **Botão primário:** fundo `#4063EE`, texto branco, estado de foco `#009CEF` com offset.
- **Botão secundário:** fundo branco, borda e texto `#4063EE`.
- **Ação positiva:** fundo `#00C977`, texto `#3C3C3C`.
- **Inputs:** rótulo sempre visível, borda neutra, foco claro e mensagens de validação próximas ao campo.
- **Cards de dados:** métrica em Bold, contexto em Regular e tendência acompanhada de ícone/texto.
- **Navegação:** item ativo em Azul Deep; usar Azul Claro apenas como destaque ou foco.
- **Tabelas:** cabeçalho em SemiBold, linhas bem separadas, ordenação e filtros claramente sinalizados.
- **Estados vazios:** linguagem tranquila, explicação curta e próxima ação explícita.
- **Loading:** skeletons suaves; evitar animações chamativas.

### Gráficos e dados

- Ordem de séries sugerida: Azul Deep, Verde Vibrante, Roxo, Azul Claro e Azul Neutro.
- Usar rótulos, padrões ou marcadores além das cores.
- Evitar gráficos 3D e efeitos que prejudiquem a leitura.
- Grafismos decorativos podem usar linhas vetoriais conectadas, retículas geométricas, fluxos de pontos, curvas e camadas sobrepostas.
- Manter os grafismos leves, com transparência e sem competir com dados ou ações.

### Imagens

- Estética publicitária, conceitual, limpa e realista.
- Iluminação suave, profundidade de campo e elegância high-tech.
- Mistura equilibrada de pessoas e elementos digitais.
- Perspectiva humana, close-up ou plano médio; fundo tecnológico abstrato.
- Usar pelo menos duas cores institucionais na direção visual.
- Evitar robôs genéricos, cérebros neon, excesso de HUD, cyberpunk escuro e banco de imagem artificial.

## 7. UX, responsividade e acessibilidade

- Atender WCAG 2.2 AA como objetivo mínimo.
- Navegação completa por teclado e foco sempre visível.
- Áreas de toque de pelo menos 44 × 44 px.
- Não depender de hover para revelar funções essenciais.
- Oferecer feedback imediato para ações, erros e salvamento.
- Pedir confirmação para ações destrutivas e explicar consequências.
- Em mobile, usar uma coluna e priorizar conteúdo; em desktop, limitar a largura de leitura e evitar espaços vazios sem função.
- Respeitar `prefers-reduced-motion`.
- Definir textos alternativos para imagens informativas; imagens decorativas devem ser ignoradas por leitores de tela.
- Não usar placeholders como substitutos de rótulos.
- Manter números, datas e unidades consistentes com o português do Brasil.

---

# Prompt mestre para criar um aplicativo

Copie, preencha os campos entre colchetes e use em um gerador de aplicativos, assistente de código ou ferramenta de design.

```text
Atue como product designer sênior, UX writer e engenheiro de front-end. Crie [NOME DO APLICATIVO], um aplicativo [WEB / MOBILE / RESPONSIVO] da Pesquise+ / P+Solution Research.

CONTEXTO DO PRODUTO
- Objetivo: [OBJETIVO]
- Público principal: [PÚBLICO]
- Problema resolvido: [PROBLEMA]
- Funcionalidades essenciais: [FUNCIONALIDADES]
- Telas necessárias: [TELAS]
- Tecnologia ou stack: [STACK, SE HOUVER]

IDENTIDADE DA MARCA
O produto deve materializar a promessa de antecipar o futuro com inteligência de dados. A percepção desejada é moderna, estratégica, visionária, confiável, ágil e humana. O arquétipo é o Sábio com toque do Herói: domínio analítico, clareza, orientação prática e capacidade de resolver.

TOM DE VOZ E CONTEÚDO
Escreva em português do Brasil com linguagem clara, direta, segura e sem exageros. Explique tecnologia sem jargão desnecessário. Transforme dados em orientação e próxima ação. Use frases curtas em botões e feedbacks. Evite tom robótico, promessas absolutas, floreios e textos genéricos. A tagline oficial é “predict the future”, sempre em minúsculas, sem ponto final e nunca traduzida.

DESIGN SYSTEM
Use Open Sans como família tipográfica:+- Bold para títulos e métricas;
- SemiBold para subtítulos, navegação e rótulos;
- Regular para corpo, formulários e tabelas;
- Light somente em textos extensos e quando a legibilidade permitir.

Use a paleta institucional:
- Azul Claro #009CEF: marca, foco, links, destaques e dados ativos;
- Roxo #6B36F7: inteligência e visão de futuro;
- Verde Vibrante #00C977: crescimento, progresso e estados positivos;
- Azul Deep #4063EE: ação primária, autoridade e navegação ativa;
- Azul Neutro #6EC3E4: fundos leves e séries secundárias;
- Cinza Escuro #3C3C3C: texto e fundos escuros;
- Cinza Claro #E8E8E8: bordas, divisores e fundos;
- Branco #FFFFFF: superfícies e respiro.

Distribua aproximadamente 60–70% de neutros, 20–30% de azuis/cinza escuro e 5–10% de verde/roxo/ciano como acentos. Não use todas as cores com o mesmo peso.

ACESSIBILIDADE DE COR
Use branco em botões #4063EE e #6B36F7. Use #3C3C3C sobre #00C977, #6EC3E4, #E8E8E8 e branco. Não use texto branco pequeno sobre #009CEF. Nunca comunique estado apenas por cor. Garanta contraste WCAG 2.2 AA.

LAYOUT E COMPONENTES
- Crie uma interface limpa, modular e tecnológica, com bastante respiro e grade baseada em 4 px.
- Use espaçamentos de 8, 12, 16, 24, 32 e 48 px.
- Use cards com raio de 12–16 px, bordas discretas e sombras suaves.
- Destaque uma ação primária por tela.
- Botão primário: #4063EE com texto branco.
- Botão secundário: branco com borda e texto #4063EE.
- Ação positiva: #00C977 com texto #3C3C3C.
- Inputs devem ter rótulos persistentes, foco visível e erros próximos ao campo.
- Estados de loading, vazio, erro, sucesso, offline e sem permissão devem ser projetados.
- Tabelas e gráficos precisam ser legíveis, filtráveis quando necessário e acompanhados de rótulos.
- Em gráficos, priorize #4063EE, #00C977, #6B36F7, #009CEF e #6EC3E4, acrescentando marcadores ou padrões.

GRAFISMOS E IMAGENS
Quando houver elementos decorativos, use linhas vetoriais conectadas, retículas geométricas, pontos em fluxo, curvas contínuas e camadas translúcidas. Eles devem sugerir dados, conectividade, decisão e transformação contínua, sem competir com o conteúdo.

Se gerar imagens, use estética publicitária, conceitual e limpa; realismo com iluminação suave; elegância high-tech; pessoas reais combinadas a elementos digitais sutis; profundidade de campo; pelo menos duas cores institucionais. Evite robôs genéricos, cérebros neon, excesso de interfaces holográficas e visual cyberpunk.

LOGOTIPO
Use apenas os arquivos oficiais fornecidos. Em fundo claro, use Logo2025.png; em fundo escuro, use Logo2025_branco.png. Preserve a proporção, a área de segurança e a largura mínima de 100 px para a assinatura completa. Não recrie o logo, não distorça, não altere cores, não separe elementos e não adicione efeitos.

RESPONSIVIDADE E ACESSIBILIDADE
- Projete mobile-first e adapte para tablet e desktop.
- Áreas clicáveis com no mínimo 44 × 44 px.
- Navegação por teclado, foco visível, semântica HTML e leitores de tela.
- Respeite prefers-reduced-motion.
- Não use placeholder como rótulo.
- Não dependa de hover.
- Mantenha o corpo preferencialmente em 16 px ou mais.

ENTREGA
Antes de implementar, apresente:
1. arquitetura de informação;
2. fluxo principal do usuário;
3. lista de telas e estados;
4. tokens de design;
5. componentes reutilizáveis;
6. decisões de acessibilidade.

Depois, gere a interface funcional e responsiva com conteúdo realista, sem lorem ipsum. Inclua dados de exemplo coerentes com pesquisa, coleta, inteligência de dados e tomada de decisão. Faça uma revisão final de consistência de marca, contraste, responsividade, estados vazios, erros e navegação por teclado.
```

## Prompt curto

```text
Crie uma interface responsiva para [PRODUTO] da Pesquise+ / P+Solution Research. Use Open Sans, fundo branco ou #E8E8E8, texto #3C3C3C, ação primária #4063EE, foco/destaques #009CEF, sucesso #00C977 e acentos pontuais #6B36F7 e #6EC3E4. O visual deve ser limpo, modular, high-tech e humano, com grafismos discretos de dados em fluxo. O tom é confiável, ágil, tecnológico, acessível e inteligente. Preserve o logotipo oficial e a tagline “predict the future”. Garanta WCAG 2.2 AA, responsividade, foco visível, navegação por teclado e todos os estados da interface. Evite excesso de cores, jargão, efeitos futuristas genéricos, gradientes sem função e textos genéricos.
```

## Prompt de auditoria

```text
Audite esta interface como guardião da marca Pesquise+ / P+Solution Research. Verifique: uso correto do logotipo; Open Sans e hierarquia tipográfica; fidelidade à paleta; contraste WCAG 2.2 AA; tom confiável, ágil, tecnológico, acessível e inteligente; clareza da ação principal; consistência de espaçamento e componentes; responsividade; navegação por teclado; estados de loading, vazio, erro, sucesso, offline e permissão; legibilidade de tabelas e gráficos; ausência de distorção do logo, excesso de cores, jargões e clichês visuais de IA. Liste problemas por gravidade e proponha correções objetivas com tokens e exemplos de microcopy.
```

## Checklist final

- [ ] O aplicativo parece confiável, moderno, claro e orientado a decisões?
- [ ] Há uma ação primária evidente por tela?
- [ ] A paleta tem hierarquia e respiro?
- [ ] Todo texto importante possui contraste AA?
- [ ] Open Sans foi usada com pesos coerentes?
- [ ] O logotipo oficial está intacto, legível e protegido?
- [ ] A tagline está em minúsculas, em inglês e sem ponto final?
- [ ] Gráficos podem ser compreendidos sem depender apenas de cor?
- [ ] Loading, vazio, erro, sucesso, offline e permissão foram previstos?
- [ ] A interface funciona em mobile, teclado e leitor de tela?
- [ ] A escrita é direta, humana e sem jargão desnecessário?
- [ ] Elementos futuristas reforçam os dados sem virar decoração excessiva?

