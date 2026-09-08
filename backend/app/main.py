import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.billing_routes import router as billing_router
from app.api.chat_routes import router as chat_router
from app.api.dashboard_routes import router as dashboard_router
from app.api.folder_routes import router as folder_router
from app.api.routes import router
from app.core.config import Settings
from app.core.logging import configure_logging
from app.services.usage import LimitExceeded

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings()
    configure_logging(app_settings.log_level)
    if app_settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=app_settings.sentry_dsn, traces_sample_rate=0.1)
    app = FastAPI(title="MyPDFChat API", version="0.1.0")
    app.state.settings = app_settings

    cors_origins = app_settings.cors_origins()
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["Content-Disposition"],
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled error", extra={"path": request.url.path, "method": request.method}
        )
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.exception_handler(LimitExceeded)
    async def limit_exceeded_handler(request: Request, exc: LimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=402,
            content={"code": "limit_exceeded", "kind": exc.kind, "limit": exc.limit, "used": exc.used},
        )

    app.include_router(router)
    app.include_router(chat_router)
    app.include_router(billing_router)
    app.include_router(dashboard_router)
    app.include_router(folder_router)
    return app


app = create_app()
