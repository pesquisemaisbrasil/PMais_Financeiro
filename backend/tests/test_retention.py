from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from models.login_event import LoginEvent
from models.refresh_token import RefreshToken
from models.user import User
from services.retention import purge_login_data

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def _ago(days: int) -> datetime:
    return NOW - timedelta(days=days)


@pytest.fixture
def records(db_session: Session, make_user: Callable[..., User]) -> User:
    user = make_user()
    for days in (400, 181, 179, 1):
        db_session.add(
            LoginEvent(
                user_id=user.id, success=False, reason="wrong_password", createdAt=_ago(days)
            )
        )
    # expirou há 40, 31, 29 dias; e uma que só vence daqui a 10 dias
    for index, expired_days_ago in enumerate((40, 31, 29, -10)):
        db_session.add(
            RefreshToken(
                user_id=user.id,
                familyId=f"f{index}",
                tokenHash=f"hash{index}",
                expiresAt=_ago(expired_days_ago),
                revoked=index == 0,
            )
        )
    db_session.commit()
    return user


def test_by_default_it_only_counts(db_session: Session, records: User) -> None:
    found = purge_login_data(db_session, now=NOW, login_events_days=180, refresh_tokens_days=30)
    assert found == {"login_events": 2, "refresh_tokens": 2}
    assert db_session.query(LoginEvent).count() == 4
    assert db_session.query(RefreshToken).count() == 4


def test_applying_deletes_only_what_passed_the_deadline(db_session: Session, records: User) -> None:
    found = purge_login_data(
        db_session, now=NOW, login_events_days=180, refresh_tokens_days=30, dry_run=False
    )
    assert found == {"login_events": 2, "refresh_tokens": 2}
    assert sorted(
        (NOW - e.createdAt.replace(tzinfo=UTC)).days for e in db_session.query(LoginEvent)
    ) == [1, 179]
    # a sessão que ainda vale e a que expirou há 29 dias ficam
    assert sorted(t.tokenHash for t in db_session.query(RefreshToken)) == ["hash2", "hash3"]


def test_without_a_deadline_nothing_is_touched(db_session: Session, records: User) -> None:
    found = purge_login_data(
        db_session, now=NOW, login_events_days=None, refresh_tokens_days=None, dry_run=False
    )
    assert found == {"login_events": 0, "refresh_tokens": 0}
    assert db_session.query(LoginEvent).count() == 4
    assert db_session.query(RefreshToken).count() == 4


def test_each_kind_has_its_own_deadline(db_session: Session, records: User) -> None:
    found = purge_login_data(
        db_session, now=NOW, login_events_days=None, refresh_tokens_days=30, dry_run=False
    )
    assert found == {"login_events": 0, "refresh_tokens": 2}
    assert db_session.query(LoginEvent).count() == 4


@pytest.mark.parametrize("days", [0, -5])
def test_a_deadline_that_would_wipe_everything_is_refused(
    db_session: Session, records: User, days: int
) -> None:
    with pytest.raises(ValueError):
        purge_login_data(
            db_session, now=NOW, login_events_days=days, refresh_tokens_days=None, dry_run=False
        )
    with pytest.raises(ValueError):
        purge_login_data(
            db_session, now=NOW, login_events_days=None, refresh_tokens_days=days, dry_run=False
        )
    assert db_session.query(LoginEvent).count() == 4
