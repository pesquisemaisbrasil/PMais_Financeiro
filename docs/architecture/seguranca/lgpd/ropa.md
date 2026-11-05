# ROPA do Financeiro (registro das operações de tratamento)

Modelo do ROPA do Connect. Bases legais **propostas**, a validar com o DPO. Por ora cobre o login, a leitura de comprovantes e os cadastros de cliente e fornecedor; as operações de pagamento, conciliação e comprovante entram quando cada módulo for entregue.

Controlador: Pesquise+. Operador: nenhum terceiro além dos provedores de login (Google e Microsoft), que só confirmam a identidade da pessoa.

| ID | Operação | Titulares | Dados | Finalidade | Base legal proposta | Compartilhamento | Prazo |
|---|---|---|---|---|---|---|---|
| FIN-L1 | Autenticar quem usa o sistema | Equipe financeira e administradores (funcionários) | Nome, e-mail, hash da senha, chave do autenticador cifrada, hash dos códigos de recuperação, identificador fixo no Google ou na Microsoft | Dar acesso só a quem pode e impedir uso indevido | Art. 7 V (execução do contrato de trabalho) e art. 7 IX (legítimo interesse em segurança) | Google ou Microsoft, só no login por SSO (recebem o pedido de login, não os dados do Financeiro) | Enquanto a conta existir |
| FIN-L2 | Registrar tentativas de login e sessões | Os mesmos | HMAC do e-mail digitado, IP mascarado, user-agent, motivo, data; hash do token de sessão | Limitar tentativas, detectar ataque e manter prova de acesso | Art. 7 IX e art. 46 (segurança); Marco Civil art. 15 (guarda de registro de acesso por 6 meses) | Ninguém | `login_events`: 6 meses. `refresh_tokens`: 30 dias após expirar |
| FIN-C1 | Ler comprovante Pix e conciliar a baixa | Entrevistadores de campo (pessoas pagas) | Nome do recebedor (cifrado), hash e máscara da chave Pix, valor, data, ID da transação, id da pessoa no Connect | Dar baixa só no que foi pago, sem pagar duas vezes | Art. 7 V (execução de contrato) e art. 7 II (obrigação legal e prova de pagamento) | P+ Connect (recebe a baixa, sem dado pessoal novo) | A definir com o DPO (Q5, Q19) |
| FIN-R1 | Cadastrar clientes e fornecedores e controlar o que se paga e se recebe deles | Pessoas de contato de empresas clientes e fornecedoras | Nome, telefone e e-mail do contato; CNPJ da empresa | Cobrar, pagar e falar com a empresa | Art. 7 V (execução de contrato) e art. 7 IX (legítimo interesse) | Ninguém fora da empresa | A definir com o DPO (Q5) |

## Medidas de segurança

Senha só em hash; chave do autenticador cifrada (AES-256-GCM); IP mascarado; e-mail das tentativas só em HMAC; MFA obrigatório no login por senha; limite de tentativas; sem CPF; nada disso em log. Detalhes em [handoff/06](../../../handoff/06-seguranca-e-lgpd.md).

## Pendências

- Prazos de FIN-L2 e a rotina de limpeza: Q26 (DPO).
