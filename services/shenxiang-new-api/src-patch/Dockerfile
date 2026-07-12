FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS builder

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
COPY web/default/package.json ./default/package.json
COPY web/classic/package.json ./classic/package.json
RUN bun install --frozen-lockfile
COPY ./web/default ./default
COPY ./VERSION /build/VERSION
RUN cd default && DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build

FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS builder-classic

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
COPY web/default/package.json ./default/package.json
COPY web/classic/package.json ./classic/package.json
RUN bun install --filter ./classic --frozen-lockfile
COPY ./web/classic ./classic
COPY ./VERSION /build/VERSION
RUN cd classic && VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build

FROM golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039 AS builder2
ENV GO111MODULE=on CGO_ENABLED=0

ARG TARGETOS
ARG TARGETARCH
ARG NEW_API_SOURCE_REPOSITORY
ARG NEW_API_REPOSITORY_COMMIT
ARG NEW_API_UPSTREAM_REPOSITORY
ARG NEW_API_UPSTREAM_COMMIT
ARG NEW_API_PATCH_SHA256
ARG NEW_API_MANIFEST_SHA256
ARG NEW_API_WORKTREE_FILE_COUNT
ARG NEW_API_WORKTREE_SHA256
ARG NEW_API_SOURCE_DIGEST
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN set -eu; \
    case "${NEW_API_WORKTREE_FILE_COUNT}" in ''|*[!0-9]*) echo "invalid worktree file count build arg" >&2; exit 1 ;; esac; \
    test -z "$(find . -type l -print -quit)" || { echo "build context contains a symbolic link" >&2; exit 1; }; \
    expected_file_count=$((NEW_API_WORKTREE_FILE_COUNT + 4)); \
    actual_file_count="$(find . -type f | wc -l | tr -d ' ')"; \
    test "${actual_file_count}" -eq "${expected_file_count}" || { echo "build context file count does not match checksum manifest" >&2; exit 1; }; \
    sha256sum -c BUILD-CHECKSUMS.sha256; \
    actual_worktree_sha256="$(sha256sum BUILD-CHECKSUMS.sha256 | awk '{print $1}')"; \
    test "${actual_worktree_sha256}" = "${NEW_API_WORKTREE_SHA256}" || { echo "worktree checksum does not match build args" >&2; exit 1; }; \
    cmp -s BUILD-MANIFEST.json common/build-manifest.json || { echo "embedded manifest copy does not match" >&2; exit 1; }; \
    actual_manifest_sha256="$(sha256sum BUILD-MANIFEST.json | awk '{print $1}')"; \
    test "${actual_manifest_sha256}" = "${NEW_API_MANIFEST_SHA256}" || { echo "manifest checksum does not match build args" >&2; exit 1; }; \
    test "$(wc -l < build.env | tr -d ' ')" -eq 11 || { echo "build.env contains an unexpected key set" >&2; exit 1; }; \
    grep -Fqx "NEW_API_CHECKSUM_FILE=BUILD-CHECKSUMS.sha256" build.env; \
    expected_image_tag="$(printf '%s' "${NEW_API_SOURCE_DIGEST}" | cut -c1-16)"; \
    grep -Fqx "NEW_API_IMAGE_TAG=${expected_image_tag}" build.env; \
    grep -Fqx "NEW_API_MANIFEST_SHA256=${NEW_API_MANIFEST_SHA256}" build.env; \
    grep -Fqx "NEW_API_PATCH_SHA256=${NEW_API_PATCH_SHA256}" build.env; \
    grep -Fqx "NEW_API_REPOSITORY_COMMIT=${NEW_API_REPOSITORY_COMMIT}" build.env; \
    grep -Fqx "NEW_API_SOURCE_DIGEST=${NEW_API_SOURCE_DIGEST}" build.env; \
    grep -Fqx "NEW_API_SOURCE_REPOSITORY=${NEW_API_SOURCE_REPOSITORY}" build.env; \
    grep -Fqx "NEW_API_UPSTREAM_COMMIT=${NEW_API_UPSTREAM_COMMIT}" build.env; \
    grep -Fqx "NEW_API_UPSTREAM_REPOSITORY=${NEW_API_UPSTREAM_REPOSITORY}" build.env; \
    grep -Fqx "NEW_API_WORKTREE_FILE_COUNT=${NEW_API_WORKTREE_FILE_COUNT}" build.env; \
    grep -Fqx "NEW_API_WORKTREE_SHA256=${NEW_API_WORKTREE_SHA256}" build.env; \
    grep -Fqx '  "schema_version": 2,' BUILD-MANIFEST.json; \
    grep -Fqx '  "checksum_file": "BUILD-CHECKSUMS.sha256",' BUILD-MANIFEST.json; \
    grep -Fqx "  \"repository\": \"${NEW_API_SOURCE_REPOSITORY}\"," BUILD-MANIFEST.json; \
    grep -Fqx "  \"repository_commit\": \"${NEW_API_REPOSITORY_COMMIT}\"," BUILD-MANIFEST.json; \
    grep -Fqx "  \"upstream_repository\": \"${NEW_API_UPSTREAM_REPOSITORY}\"," BUILD-MANIFEST.json; \
    grep -Fqx "  \"upstream_commit\": \"${NEW_API_UPSTREAM_COMMIT}\"," BUILD-MANIFEST.json; \
    grep -Fqx "  \"patch_base\": \"${NEW_API_UPSTREAM_COMMIT}\"," BUILD-MANIFEST.json; \
    grep -Fqx "  \"patch_sha256\": \"${NEW_API_PATCH_SHA256}\"," BUILD-MANIFEST.json; \
    grep -Fqx "  \"worktree_file_count\": ${NEW_API_WORKTREE_FILE_COUNT}," BUILD-MANIFEST.json; \
    grep -Fqx "  \"worktree_sha256\": \"${NEW_API_WORKTREE_SHA256}\"" BUILD-MANIFEST.json; \
    grep -Fqx "  \"source_digest\": \"${NEW_API_SOURCE_DIGEST}\"," BUILD-MANIFEST.json; \
    calculated_source_digest="$(printf '%s\n' \
      "${NEW_API_SOURCE_REPOSITORY}" \
      "${NEW_API_REPOSITORY_COMMIT}" \
      "${NEW_API_UPSTREAM_REPOSITORY}" \
      "${NEW_API_UPSTREAM_COMMIT}" \
      "${NEW_API_UPSTREAM_COMMIT}" \
      "${NEW_API_PATCH_SHA256}" \
      "${NEW_API_WORKTREE_SHA256}" | sha256sum | awk '{print $1}')"; \
    test "${calculated_source_digest}" = "${NEW_API_SOURCE_DIGEST}" || { echo "source_digest does not match build args" >&2; exit 1; }
COPY --from=builder /build/web/default/dist ./web/default/dist
COPY --from=builder-classic /build/web/classic/dist ./web/classic/dist
RUN go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=builder2 /build/new-api /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
