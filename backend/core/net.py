import ipaddress


def mask_ip(raw: str | None) -> str | None:
    """IPv4 vira /24 (`200.1.2.0`), IPv6 vira /48 (`2001:db8:1::`). Nunca o IP completo."""
    if not raw:
        return None
    try:
        address = ipaddress.ip_address(raw)
    except ValueError:
        return None
    prefix = 24 if address.version == 4 else 48
    network = ipaddress.ip_network(f"{address}/{prefix}", strict=False)
    return str(network.network_address)
