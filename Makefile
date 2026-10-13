# Build and test the production image locally. Needs Docker.

IMAGE ?= anvil:local
COMMIT := $(shell git rev-parse HEAD)

.PHONY: image image-smoke image-up image-logs image-down

# Build the production image, stamped with the current commit.
image:
	docker build \
		--build-arg GIT_COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$$(date -u +%Y-%m-%dT%H:%M:%SZ) \
		--tag $(IMAGE) \
		.

# Build, then run migrations and check the probes and SPA, as CI does before
# publishing. Uses a throwaway Postgres, never your dev database.
image-smoke: image
	scripts/smoke-test-image.sh $(IMAGE) $(COMMIT)

# Build, then run the image against your dev database (compose.yaml's `image`
# profile): migrates it, then serves the app on http://localhost:8001.
image-up: image
	docker compose --profile image up --detach --wait
	@echo "App running at http://localhost:8001"

# Follow the app's logs (and the migration run's).
image-logs:
	docker compose --profile image logs --follow migrate app

# Stop and remove the image's containers. Leaves the dev database running and
# its data intact.
image-down:
	docker compose --profile image rm --stop --force migrate app
