import pytest
from fastapi.testclient import TestClient

from anvil.main import FRONTEND_DIST, app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.skipif(
    not (FRONTEND_DIST / "index.html").exists(),
    reason="frontend not built; the index.html fallback only exists once it is",
)
def test_unknown_api_path_is_404_not_frontend() -> None:
    # The frontend fallback only serves index.html to browser-style
    # navigations (GET accepting text/html), so send one.
    response = client.get("/api/does-not-exist", headers={"accept": "text/html"})

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
