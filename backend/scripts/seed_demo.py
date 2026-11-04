"""Dados FICTÍCIOS para ver o Início e o Contas a pagar localmente, com as datas em volta de hoje.

Uso: python scripts/seed_demo.py

Não roda em produção, e não faz nada se já existir algum título: nunca mistura com dado real.
"""

import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.config import ENVIRONMENT  # noqa: E402
from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.payable import Payable, PayableAllocation, PayableItem  # noqa: E402
from models.reference import (  # noqa: E402
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402,F401
from services.payable import today  # noqa: E402


def main() -> None:
    if ENVIRONMENT == "production":
        sys.exit("seed_demo não roda em produção")
    db = SessionLocal()
    try:
        if db.query(Payable).first():
            print("Já existem títulos no banco. Nada mudou.")
            return
        count = seed(db)
        db.commit()
        print(f"{count} títulos fictícios criados.")
    finally:
        db.close()


def seed(db) -> int:  # type: ignore[no-untyped-def]
    on = today()

    pplus, mc = Company(name="PPlus"), Company(name="MC")
    db.add_all([pplus, mc, Company(name="P Plus Log"), Company(name="Medtrek")])
    db.flush()
    consumo = BusinessUnit(company_id=pplus.id, name="Consumo SP")
    cati = BusinessUnit(company_id=pplus.id, name="CATI Curitiba")
    matriz = BusinessUnit(company_id=mc.id, name="Matriz")
    db.add_all([consumo, cati, matriz])
    campo, admin = CostCenter(name="Campo"), CostCenter(name="Administrativo")
    tecnologia = CostCenter(name="Tecnologia")
    db.add_all([campo, admin, tecnologia])
    categories = {
        code: ExpenseCategory(code=code, name=name)
        for code, name in [
            ("2.01", "Pessoal de campo"),
            ("2.02", "Incentivos"),
            ("2.03", "Viagens e deslocamento"),
            ("2.04", "Material e gráfica"),
            ("3.01", "Aluguel e condomínio"),
            ("3.02", "Energia e telefonia"),
            ("3.03", "Serviços de terceiros"),
            ("3.04", "Software"),
        ]
    }
    db.add_all(categories.values())
    pix, boleto = PaymentMethod(name="Pix"), PaymentMethod(name="Boleto")
    db.add_all([pix, boleto, PaymentMethod(name="TED"), PaymentMethod(name="Cartão de crédito")])
    db.add_all(
        [
            BankAccount(company_id=pplus.id, name="Itaú · PPlus"),
            BankAccount(company_id=mc.id, name="Bradesco · MC"),
        ]
    )
    suppliers = {
        key: Supplier(nickname=nickname, name=name)
        for key, nickname, name in [
            ("batel", "Batel", "Imóveis Batel Administradora"),
            ("conecta", "Conecta", "Telefonia Conecta"),
            ("grafica", "Ponto Certo", "Gráfica Ponto Certo"),
            ("exata", "Exata", "Contabilidade Exata"),
            ("hotel", "Hotel Central", "Hotel Central Curitiba"),
            ("viacao", "Rápida Sul", "Viação Rápida Sul"),
            ("nuvem", "Nuvem", "Software Nuvem Ltda"),
        ]
    }
    db.add_all(suppliers.values())
    p1804 = Project(code="1804", title="Pesquisa de satisfação · varejo")
    p1790 = Project(code="1790", title="Tracking de marca · CATI")
    db.add_all([p1804, p1790])
    db.flush()

    def payable(
        days: int,
        value: str,
        description: str,
        category: str,
        *,
        supplier: str | None = None,
        payee: str | None = None,
        projects: dict[Project, str] | None = None,
        items: list[tuple[str, str, str, str | None]] | None = None,
        **extra: object,
    ) -> Payable:
        due: date = on + timedelta(days=days)
        record = Payable(
            company_id=extra.pop("company", pplus.id),
            unit_id=extra.pop("unit", consumo.id),
            cost_center_id=extra.pop("center", campo.id),
            category_id=categories[category].id,
            payment_method_id=extra.pop("method", pix.id),
            supplier_id=suppliers[supplier].id if supplier else None,
            payeeName=payee,
            description=description,
            issueDate=on - timedelta(days=20),
            dueDate=due,
            competence=due.strftime("%Y-%m"),
            amount=Decimal(value),
            allocations=[
                PayableAllocation(project_id=project.id, amount=Decimal(amount))
                for project, amount in (projects or {}).items()
            ],
            items=[
                PayableItem(
                    name=name,
                    documentType=document,
                    amount=Decimal(amount),
                    invoiceStatus=status,
                )
                for name, document, amount, status in (items or [])
            ],
            **extra,
        )
        db.add(record)
        return record

    payable(
        -9,
        "389.90",
        "Telefonia e internet",
        "3.02",
        supplier="conecta",
        method=boleto.id,
        center=admin.id,
        documentType="Fatura",
    )
    payable(
        0,
        "1250.00",
        "Impressão de questionários",
        "2.04",
        supplier="grafica",
        unit=cati.id,
        method=boleto.id,
        projects={p1804: "1250.00"},
        docsReceivedOn=on - timedelta(days=1),
        barcode="23793381286000000000000000000000000000000000",
    )
    payable(
        0,
        "320.00",
        "Passagens de ônibus · campo",
        "2.03",
        supplier="viacao",
        projects={p1790: "320.00"},
        documentType="Recibo",
    )
    payable(
        0,
        "2800.00",
        "Incentivos aos entrevistados",
        "2.02",
        payee="14 entrevistados",
        origin="incentivo",
        unit=cati.id,
        projects={p1804: "2800.00"},
        items=[(f"Entrevistado {n:02d}", "Incentivo", "200.00", None) for n in range(1, 15)],
    )
    payable(
        0,
        "1300.00",
        "Gráfica · PRJ-1804",
        "2.04",
        payee="Provisão",
        type="provisao",
        projects={p1804: "1300.00"},
    )
    payable(
        0,
        "640.00",
        "Entrevistadores · PRJ-1804",
        "2.01",
        payee="4 entrevistadores",
        origin="connect",
        projects={p1804: "640.00"},
        items=[
            ("Sandra Ribeiro (exemplo)", "NF", "120.00", "Recebida"),
            ("Marcos Lima (exemplo)", "NF", "200.00", "Pendente"),
            ("Paula Dias (exemplo)", "RPA", "160.00", None),
            ("João Prado (exemplo)", "RPA", "160.00", None),
        ],
    )
    payable(
        2,
        "2800.00",
        "Honorários contábeis",
        "3.03",
        supplier="exata",
        center=admin.id,
        documentType="NF",
        documentNumber="1203",
        documentDate=on - timedelta(days=2),
    )
    payable(
        6,
        "1980.00",
        "Hospedagem da equipe de campo",
        "2.03",
        supplier="hotel",
        unit=cati.id,
        projects={p1804: "1188.00", p1790: "792.00"},
    )
    payable(
        8,
        "5800.00",
        "Equipe de campo · PRJ-1790",
        "2.01",
        payee="Equipe de campo (3 pessoas)",
        origin="folha",
        projects={p1790: "5800.00"},
        items=[
            ("Gabriela Torres (exemplo)", "RPA", "2000.00", None),
            ("Diego Rocha (exemplo)", "NF", "2300.00", "Recebida"),
            ("Elisa Prado (exemplo)", "NF", "1500.00", "Pendente"),
        ],
    )
    payable(
        12,
        "899.00",
        "Licenças de software",
        "3.04",
        supplier="nuvem",
        center=tecnologia.id,
        method=boleto.id,
    )
    payable(
        15,
        "2100.00",
        "Aluguel da sala de grupo",
        "3.01",
        supplier="batel",
        company=mc.id,
        unit=matriz.id,
        center=admin.id,
        method=boleto.id,
        documentType="Boleto",
    )
    payable(
        22,
        "6000.00",
        "Supervisão de campo · PRJ-1790",
        "2.01",
        payee="Provisão",
        type="provisao",
        projects={p1790: "6000.00"},
    )
    return 12


if __name__ == "__main__":
    main()
