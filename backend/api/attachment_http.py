"""O que as rotas de anexo das contas a pagar e dos títulos a receber têm em comum."""

from urllib.parse import quote

from fastapi import HTTPException, Response, UploadFile, status

from services import attachments

NOT_FOUND = "Documento não encontrado"
UNAVAILABLE = "Os anexos não estão disponíveis agora. Avise quem cuida do sistema."
CORRUPTED = "Não foi possível abrir o documento: ele não confere com o que foi guardado."


def read_upload(file: UploadFile) -> tuple[str, bytes]:
    """O nome e o conteúdo do arquivo enviado, sem ler mais do que o limite."""
    content = file.file.read(attachments.MAX_BYTES + 1)
    if not content or len(content) > attachments.MAX_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, attachments.INVALID_FILE)
    return file.filename or "", content


def download_response(name: str, content_type: str, content: bytes) -> Response:
    """O arquivo decifrado para o navegador baixar, nunca abrir, e sem guardar cópia."""
    fallback = name.encode("ascii", "replace").decode().replace('"', "").replace("?", "_")
    return Response(
        content,
        media_type=content_type,
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name)}"
            ),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
