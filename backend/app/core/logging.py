import logging
import sys

_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    """Install a stdout log handler so application logs are actually emitted.

    Safe to call more than once; subsequent calls only adjust the level. Uvicorn
    manages its own access/error loggers, so we attach our handler to the root
    logger that the ``app.*`` module loggers propagate to.
    """
    global _CONFIGURED
    resolved = getattr(logging, level.upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(resolved)

    if _CONFIGURED:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    root.addHandler(handler)
    _CONFIGURED = True
