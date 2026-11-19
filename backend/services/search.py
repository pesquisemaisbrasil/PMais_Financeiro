"""Busca em todo o sistema (pedido do Bruno, 18/11/2026; spec busca-geral).

Uma palavra ("itau") acha contas a pagar, contas a receber, notas fiscais, projetos, clientes,
fornecedores, plano de contas, centros de custo, unidades, empresas e contas bancárias, separados
por grupo. Vale a mesma regra da busca da lista de contas: sem acento, sem diferença de maiúscula,
cada palavra em qualquer pedaço e em qualquer ordem; um valor ("1.250,00") acha a conta com ele.

Só procura no que as telas já mostram para quem é do financeiro. Não procura em dado pessoal de
contato (e-mail, telefone), nas pessoas das listas de pagamento nem em chave Pix. O termo buscado
não vai para o log.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from sqlalchemy.orm import Session, selectinload

from core.text import format_brl, format_date_br, matches_words, normalize
from models.payable import Payable
from models.receivable import Receivable
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    Project,
    Supplier,
)
from services import payable as payable_service
from services import receivable as receivable_service
from services.payable import PayableInvalid

# Quantos itens cada grupo mostra; "Ver todos" leva à tela com a busca aplicada.
GROUP_LIMIT = 5
MIN_LENGTH = 2
SHORT_TERM = "Digite ao menos 2 letras para buscar"
MAX_LENGTH = 80
LONG_TERM = "A busca aceita até 80 letras"
NOTE_TYPES = {"NF"}


@dataclass
class Hit:
    title: str
    subtitle: str
    href: str


@dataclass
class Group:
    key: str
    label: str
    moreHref: str
    total: int = 0
    hits: list[Hit] = field(default_factory=list)


def _words(term: str) -> list[str]:
    return normalize(term).split()


def _matches(parts: Iterable[str | None], words: list[str]) -> bool:
    return matches_words(" ".join(part for part in parts if part), " ".join(words))


def _group(key: str, label: str, more: str, found: list[Any], hit: Callable[[Any], Hit]) -> Group:
    return Group(
        key=key,
        label=label,
        moreHref=more,
        total=len(found),
        hits=[hit(item) for item in found[:GROUP_LIMIT]],
    )


def _situation(active: bool) -> str:
    return "" if active else " · inativo"


def _company_name(companies: dict[int, Company], company_id: int | None) -> str | None:
    """O apelido da empresa, ou o nome quando ela não tem apelido."""
    company = companies.get(company_id) if company_id is not None else None
    return (company.nickname or company.name) if company else None


def _named(name: str, document: str | None, active: bool) -> str:
    """ "Banco Itaú S.A. · 11.222.333/0001-81 · inativo": o nome, o CNPJ e a situação."""
    return f"{name}{f' · {document}' if document else ''}{_situation(active)}"


def _records(db: Session, model: type[Any]) -> list[Any]:
    return db.query(model).order_by(model.id).all()


def _payable_hit(payable: Payable) -> Hit:
    who = payable_service.payee_name(payable)
    return Hit(
        title=payable.description,
        subtitle=f"{who} · vence {format_date_br(payable.dueDate)} · {format_brl(payable.amount)}",
        href=f"/contas-a-pagar?modo=tudo&conta={payable.id}",
    )


def _receivable_hit(receivable: Receivable) -> Hit:
    customer = receivable.customer.nickname if receivable.customer else "—"
    return Hit(
        title=receivable.description,
        subtitle=(
            f"{customer} · vence {format_date_br(receivable.dueDate)} · "
            f"{format_brl(receivable.amount)}"
        ),
        href=f"/contas-a-receber?modo=tudo&conta={receivable.id}",
    )


def _note_hit(document: Payable | Receivable) -> Hit:
    if isinstance(document, Payable):
        who = payable_service.payee_name(document)
        kind, href = "Conta a pagar", f"/contas-a-pagar?modo=tudo&conta={document.id}"
    else:
        who = document.customer.nickname if document.customer else "—"
        kind, href = "Conta a receber", f"/contas-a-receber?modo=tudo&conta={document.id}"
    issued = (
        f" · emitida em {format_date_br(document.documentDate)}" if document.documentDate else ""
    )
    return Hit(
        title=f"{document.documentType} {document.documentNumber or 's/ número'} · {who}",
        subtitle=f"{kind} · {format_brl(document.amount)}{issued}",
        href=href,
    )


# A tela de cada grupo: quem tem a tela bloqueada não vê o grupo (níveis de acesso, 19/11). As notas
# fiscais vêm das contas a pagar e a receber, então somem com qualquer uma das duas bloqueada.
GROUP_SCREENS = {
    "payables": ("contas-a-pagar",),
    "receivables": ("contas-a-receber",),
    "notes": ("contas-a-pagar", "contas-a-receber"),
}


def blocked(key: str, screens: list[str]) -> bool:
    return any(screen in screens for screen in GROUP_SCREENS.get(key, ("cadastros",)))


def search(db: Session, term: str) -> list[Group]:
    """Os grupos com pelo menos um resultado, na ordem em que aparecem na tela."""
    term = term.strip()
    words = _words(term)
    if len("".join(words)) < MIN_LENGTH:
        raise PayableInvalid(SHORT_TERM)
    if len(term) > MAX_LENGTH:
        raise PayableInvalid(LONG_TERM)
    link = quote(term)
    groups: list[Group] = []

    # Contas a pagar e a receber: as mais recentes primeiro
    payables = [
        p for p in payable_service._base_query(db).all() if payable_service.matches_search(p, term)
    ]
    payables.sort(key=lambda p: (p.dueDate, p.id), reverse=True)
    receivables = [
        r
        for r in db.query(Receivable)
        .filter(Receivable.deletedAt.is_(None))
        .options(selectinload(Receivable.customer), selectinload(Receivable.project))
        .all()
        if receivable_service.matches_search(r, term)
    ]
    receivables.sort(key=lambda r: (r.dueDate, r.id), reverse=True)
    groups.append(
        _group(
            "payables",
            "Contas a pagar",
            f"/contas-a-pagar?modo=tudo&busca={link}",
            payables,
            _payable_hit,
        )
    )
    groups.append(
        _group(
            "receivables",
            "Contas a receber",
            f"/contas-a-receber?modo=tudo&busca={link}",
            receivables,
            _receivable_hit,
        )
    )
    notes: list[Payable | Receivable] = [
        *(p for p in payables if p.documentType in NOTE_TYPES),
        *(r for r in receivables if r.documentType in NOTE_TYPES),
    ]
    groups.append(
        _group(
            "notes", "Notas fiscais", f"/contas-a-pagar?modo=tudo&busca={link}", notes, _note_hit
        )
    )

    customers = {c.id: c for c in _records(db, Customer)}
    projects = [
        p
        for p in _records(db, Project)
        if _matches(
            [
                p.code,
                f"PRJ-{p.code}",
                p.title,
                *(
                    (customers[p.customer_id].nickname, customers[p.customer_id].name)
                    if p.customer_id in customers
                    else ()
                ),
            ],
            words,
        )
    ]
    groups.append(
        _group(
            "projects",
            "Projetos",
            f"/cadastros?aba=projects&busca={link}",
            projects,
            lambda p: Hit(
                title=f"PRJ-{p.code} · {p.title}",
                subtitle=(
                    (
                        customers[p.customer_id].nickname
                        if p.customer_id in customers
                        else "Sem cliente"
                    )
                    + (" · encerrado" if p.status == "encerrado" else "")
                    + _situation(p.active)
                ),
                href=f"/relatorios/projeto?codigo={quote(p.code)}",
            ),
        )
    )

    def parties(model: type[Any], key: str, label: str) -> None:
        found = [
            r
            for r in _records(db, model)
            if _matches([r.code, r.nickname, r.name, r.document], words)
        ]
        groups.append(
            _group(
                key,
                label,
                f"/cadastros?aba={key}&busca={link}",
                found,
                lambda r: Hit(
                    title=r.nickname,
                    subtitle=_named(r.name, r.document, r.active),
                    href=f"/cadastros?aba={key}&busca={quote(r.nickname)}",
                ),
            )
        )

    parties(Customer, "customers", "Clientes")
    parties(Supplier, "suppliers", "Fornecedores")

    categories = [c for c in _records(db, ExpenseCategory) if _matches([c.code, c.name], words)]
    groups.append(
        _group(
            "categories",
            "Plano de contas",
            f"/cadastros?aba=categories&busca={link}",
            categories,
            lambda c: Hit(
                title=" ".join(part for part in (c.code, c.name) if part),
                subtitle=("Receita" if c.kind == "receita" else "Despesa") + _situation(c.active),
                href=f"/cadastros?aba=categories&busca={quote(c.name)}",
            ),
        )
    )
    centers = [c for c in _records(db, CostCenter) if _matches([c.code, c.name], words)]
    groups.append(
        _group(
            "costCenters",
            "Centros de custo",
            f"/cadastros?aba=costCenters&busca={link}",
            centers,
            lambda c: Hit(
                title=" · ".join(part for part in (c.code, c.name) if part),
                subtitle=(f"Dentro de {c.parent.name}" if c.parent else "Centro principal")
                + _situation(c.active),
                href=f"/cadastros?aba=costCenters&busca={quote(c.name)}",
            ),
        )
    )
    companies = {c.id: c for c in _records(db, Company)}
    units = [u for u in _records(db, BusinessUnit) if _matches([u.code, u.name], words)]
    groups.append(
        _group(
            "units",
            "Unidades",
            f"/cadastros?aba=units&busca={link}",
            units,
            lambda u: Hit(
                title=u.name,
                subtitle=(_company_name(companies, u.company_id) or "—") + _situation(u.active),
                href=f"/cadastros?aba=units&busca={quote(u.name)}",
            ),
        )
    )
    found_companies = [
        c for c in companies.values() if _matches([c.code, c.nickname, c.name, c.document], words)
    ]
    groups.append(
        _group(
            "companies",
            "Empresas",
            f"/cadastros?aba=companies&busca={link}",
            found_companies,
            lambda c: Hit(
                title=c.nickname or c.name,
                subtitle=_named(c.name, c.document, c.active),
                href=f"/cadastros?aba=companies&busca={quote(c.nickname or c.name)}",
            ),
        )
    )
    accounts = [a for a in _records(db, BankAccount) if _matches([a.name, a.bankName], words)]
    groups.append(
        _group(
            "bankAccounts",
            "Contas bancárias",
            f"/cadastros?aba=bankAccounts&busca={link}",
            accounts,
            lambda a: Hit(
                title=a.name,
                subtitle=(
                    " · ".join(
                        part
                        for part in (
                            a.bankName,
                            f"agência {a.agency}" if a.agency else None,
                            _company_name(companies, a.company_id),
                        )
                        if part
                    )
                    or "Conta bancária"
                )
                + _situation(a.active),
                href=f"/cadastros?aba=bankAccounts&busca={quote(a.name)}",
            ),
        )
    )
    return [group for group in groups if group.total]
