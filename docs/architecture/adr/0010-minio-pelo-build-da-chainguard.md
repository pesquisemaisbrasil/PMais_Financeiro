# ADR 0010: Manter o MinIO, pelo build da Chainguard fixo por digest

**Status:** Aceito, provisório (decisão do Bruno em 05/11/2026; o João pode trocar na Q18)
**Data:** 05/11/2026

## Contexto

A decisão 14 do handoff pede os arquivos do Financeiro em MinIO próprio, com bucket e usuário próprios. O projeto MinIO foi arquivado no GitHub e as imagens oficiais saíram do ar: `quay.io/minio/minio` (inclusive a `latest` e as versões fixas) e `minio/minio` não podem mais ser baixadas. O compose do Connect ainda aponta para `quay.io/minio/minio:latest`.

O sistema ainda não guarda nenhum arquivo; o MinIO só precisa subir saudável e ter o bucket.

## Decisão

Manter o MinIO, usando o build mantido pela **Chainguard** (`cgr.dev/chainguard/minio`, versão RELEASE.2026-10-23 na data desta decisão) e o cliente `cgr.dev/chainguard/minio-client`. As duas imagens ficam **fixas pelo digest** no `docker-compose.yml`, nunca por `latest`.

- O serviço `minio` sobe nas portas 9010 (API) e 9011 (console), sem conflito com o Connect.
- O `minio-init` cria o bucket `financeiro-arquivos` uma vez.
- O administrador do MinIO deste compose já é só do Financeiro (instância separada da do Connect). O **usuário restrito ao bucket**, com política só nele, entra junto com o primeiro upload.

## Consequências

- O código continua falando S3 (`boto3`): trocar para outro armazenamento compatível com S3 (SeaweedFS, Garage ou um serviço na nuvem) é troca de imagem e de variáveis, sem reescrever o sistema.
- **Risco aceito:** o MinIO deixou de ter manutenção oficial. O build da Chainguard recebe correções, mas é dependência de um terceiro. Revisar o digest a cada mês e antes de qualquer ida para produção.
- Subir uma imagem nova é decisão consciente: troque o digest, rode `bash scripts/verify-delivery.sh` e o `docker compose up` do zero.
- Em produção, a criptografia em duas camadas e o usuário restrito têm de existir antes do primeiro arquivo real (decisão 14).
- A pergunta Q18 continua aberta para o João confirmar ou trocar de produto.
