# Validação do mockup interativo — P+ Financeiro

**Data:** 25/10/2026  
**Escopo:** dashboard e sete módulos de demonstração local; nenhuma operação de dados financeiros reais.

## Evidências

- TypeScript passou após a integração e as correções.
- A suíte integrada anterior às correções finais passou 58 testes em cinco arquivos. O servidor protegido e as helpers de plataforma foram preservados.
- Após as correções, passaram 14 testes dirigidos do núcleo compartilhado e oito testes de renderização estática das páginas, sem browser, gravação de banco, upload ou chamada bancária/Connect. Não foi repetida uma bateria completa de aceitação a cada ajuste.
- O build de cliente/servidor passou. As oito páginas demonstrativas são carregadas sob demanda. Permanecem avisos não fatais do script dinâmico de plataforma e do pacote principal acima do limiar de 500 kB; não foram ocultados.
- O Preview voltou a responder na porta configurada. Manifesto HTTP 200 JSON com 15 rotas, igual ao conjunto de páginas de App.tsx. APIs de negócio/autenticação/admin/financeiro testadas permanecem HTTP 503; /404 mantém status real; logo estático continua disponível.

## Transições verificadas no mesmo modelo das telas

Fixtures válidas e estado corrompido rejeitado; dinheiro positivo/exato e separadores inválidos recusados; liquidação parcial de título gera transação correspondente; total não excede saldo; provisão convertida não permanece no previsto; contraparte/centro inativo não entra em novo título; código duplicado recusado; lote de entrevistadores exato e sem segunda utilização; aprovação única de folha; liquidação em Contas sincroniza folha/lote e itens de origem; pendência documental fictícia bloqueia até resolução explícita local; conciliação não duplica; fechar/reabrir mês requer condições/motivo; títulos gerados por provisão/entrevistador/folha não criam competência em período fechado; nomes editados preservam IDs históricos; relação liquidação/transação é um-para-um na validação persistida.

A renderização estática das oito páginas confirmou aviso de dados sintéticos, título de página e IDs de elementos não duplicados. Isso não é teste click-through ou certificação de acessibilidade/browser.

## Revisão e correções

Uma revisão independente somente leitura confirmou os fluxos normais e a coerência de datas/totais disponíveis, e apontou: categoria ausente no M7, guardas incompletas de período, três atalhos errados da folha, CSS de tabelas e lacuna de unicidade de liquidação. Foram corrigidos no código e rechecados os caminhos afetados. Detalhes da revisão inicial e atualização posterior estão em `revisao-mockup.md`.

O M7 agora filtra títulos/liquidações/provisões/resultado/aging/conciliação por categoria usando o mesmo predicado das linhas; o resumo/exportação registra os filtros. Intervalo invertido mostra erro e bloqueia exportação. Tabelas possuem largura/rolagem e formulários/filtros têm estilos aplicados. Confirmações nativas foram substituídas por diálogo acessível dentro do app nas ações que as utilizavam; demais pagamentos/conciliações usam controles explícitos de confirmação na própria tela.

## Limites mantidos

Não foi testado browser real, múltiplos dispositivos, leitor de tela ou a experiência de impressão/download do usuário. Os testes provam renderização e lógica local, não domínio contábil, LGPD, segurança de produção ou persistência corporativa. Acessibilidade global não foi certificada. O estado fica no browser; nenhuma entidade de demonstração vai a API/DB. Status de Implantação é real e separado.

Login/MFA, papéis e usuários, auditoria financeira append-only, banco financeiro, backup/restauração, regras fiscais reais, documentos/PDF/OFX/CSV real, Pix, Connect/Itaú, migração e produção continuam não entregues/bloqueados. O orçamento, a regra unitária, classificações e lifecycle de projeto são hipóteses sintéticas do mockup, não definições aprovadas. As funcionalidades completas descritas nos specs operacionais permanecem nos gates do TODO.
