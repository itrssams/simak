from django.db import connections, transaction


def get_rssams_db_alias() -> str:
    """Return the configured Django database alias for `rssams`, falling back to `default`."""
    return 'rssams' if 'rssams' in connections.databases else 'default'


def get_rssams_connection():
    """Return the Django database connection wrapper pointing at `rssams`."""
    return connections[get_rssams_db_alias()]


def get_rssams_cursor():
    """Return a cursor context manager targeting the `rssams` database."""
    return get_rssams_connection().cursor()


def rssams_atomic():
    """Return a `transaction.atomic` block targeting the `rssams` database alias."""
    return transaction.atomic(using=get_rssams_db_alias())
