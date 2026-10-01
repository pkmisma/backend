# backend

REST API for the visitor-feedback form used by the sibling **`frontend`**
repo. Stores entries in SQLite (file-backed; intended to run on a PVC in
non-dev environments).

> The frontend page lives in a different repo and is deployed by a separate
> Helm chart. This README covers the API and its chart only.

---

## 1. What this app does

Exposes a tiny REST API:
- `GET  /api/info`     — service identity (name, version, env)
- `GET  /api/feedback` — most recent 50 feedback rows
- `POST /api/feedback` — submit a new entry
- `GET  /healthz`      — plain `200 ok` for k8s probes

Persistence is SQLite via `better-sqlite3`, file at the path in `DB_PATH`
(default `/data/feedback.db`).

---

## 2. Repository layout

```
backend/
├── README.md                  ← you are here
├── Dockerfile                 ← node:20-alpine image
├── .dockerignore
├── package.json
├── src/
│   └── server.js              ← all routes in one file
└── helm/                      ← chart for Kubernetes
    ├── Chart.yaml
    ├── values.yaml            ← defaults (overridable)
    ├── templates/
    │   ├── _helpers.tpl
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── ingress.yaml
    └── envs/                  ← one values file per environment
        ├── dev.yaml
        ├── staging.yaml
        └── prod.yaml
```

---

## 3. Prerequisites

- **Node.js 20** (for local dev)
- **Docker** (for the image build)
- **Helm 3.x** + **kubectl** + a reachable cluster (for the helm path)
- For staging/prod: a StorageClass that supports `ReadWriteOnce` PVCs

---

## 4. Environment variables

| Var          | Default                  | Notes                                                   |
|--------------|--------------------------|---------------------------------------------------------|
| `PORT`       | `3000`                   | HTTP listen port                                        |
| `DB_PATH`    | `/data/feedback.db`      | SQLite file path. Mount a PVC at `/data` for persistence. |
| `APP_ENV`    | `dev`                    | Free-form, surfaced via `/api/info`                     |
| `APP_VERSION`| `1.0.0`                  | Surfaced via `/api/info`                                |

---

## 5. API reference

### `GET /healthz`
Plain-text `200 ok`. Used by Kubernetes liveness/readiness probes.

### `GET /api/info`
```json
{ "service": "feedback-api", "version": "1.0.0", "env": "dev" }
```

### `GET /api/feedback`
Returns up to 50 rows, newest first:
```json
[
  { "id": 2, "name": "bob",   "rating": 4, "comment": "good",   "created_at": "2026-10-01 12:35:00" },
  { "id": 1, "name": "alice", "rating": 5, "comment": "loved it", "created_at": "2026-10-01 12:34:56" }
]
```

### `POST /api/feedback`
Request body:
```json
{ "name": "alice", "rating": 5, "comment": "loved it" }
```
Validation:
- `name` is required (non-empty string)
- `rating` must be an integer in `[1, 5]`
- `comment` is optional (string)

Response (`201`):
```json
{ "id": 1, "name": "alice", "rating": 5, "comment": "loved it", "created_at": "2026-10-01 12:34:56" }
```
Failure (`400`):
```json
{ "error": "rating must be an integer 1-5" }
```

---

## 6. Run locally with Node

```bash
npm install
npm start
# → feedback-api listening on :3000, db=./data/feedback.db
```

In another shell:
```bash
curl -s localhost:3000/healthz
# ok

curl -s localhost:3000/api/info
# {"service":"feedback-api","version":"1.0.0","env":"dev"}

curl -s -X POST localhost:3000/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"name":"alice","rating":5,"comment":"loved it"}'

curl -s localhost:3000/api/feedback
```

The SQLite file lands in `./data/feedback.db`. Delete that directory to
reset.

---

## 7. Run locally with Docker

```bash
docker build -t backend-api:dev .
docker run --rm -p 3000:3000 -v $(pwd)/data:/data backend-api:dev
# → listens on :3000, db persisted to ./data on the host
```

---

## 8. How the frontend connects to this service

The frontend nginx container reverse-proxies `/api/*` to the
`backend-api:80` service in the same Kubernetes namespace. So from the
browser's perspective, all calls go to one origin (the frontend host) and
the proxy handles the hop in-cluster.

```
Browser ──HTTP──> frontend-app:80 ──proxy_pass──> backend-api:80 (this chart)
                (same-origin, no CORS)            (ClusterIP, namespace-local)
```

If you rename the backend release, the frontend chart's `backendService`
value must be updated. If you only change the backend port, set
`backendPort` in the frontend env values file (the backend chart's
`service.port` defaults to `80`).

---

## 9. Build the image

```bash
docker build -t <registry>/backend-api:<tag> .
```

Base image: `node:20-alpine` (pulled from Docker Hub). Production
dependencies only — no devDependencies installed.

```bash
docker push <registry>/backend-api:<tag>
```

---

## 10. Deploy to Kubernetes with Helm

```bash
# 0. build & push image
docker build -t <registry>/backend-api:1.0.0-<env> .
docker push  <registry>/backend-api:1.0.0-<env>

# 1. namespace
kubectl create namespace feedback-<env> --dry-run=client -o yaml | kubectl apply -f -

# 2. install/upgrade (deploy this BEFORE the frontend chart)
helm upgrade --install backend-api ./helm \
  -n feedback-<env> \
  -f ./helm/envs/<env>.yaml
```

`<env>` is one of `dev`, `staging`, `prod`. The Helm release name
**`backend-api`** is what the frontend chart looks up by default — keep
this name unless you also update `backendService` in the frontend values
file.

### 10.1 Per-environment config

| Env      | Replicas | PVC          | Service   | Ingress                  |
|----------|----------|--------------|-----------|--------------------------|
| dev      | 1        | disabled     | ClusterIP | (off)                    |
| staging  | 2        | 2 Gi         | ClusterIP | optional, off by default |
| prod     | 3        | 10 Gi, sc `standard` | ClusterIP | enabled (prod host) |

The PVC mounts at `/data` (the directory containing `feedback.db`). In
dev, persistence is disabled and the SQLite file is lost on pod restart —
fine for ephemeral dev work, never use it in staging or prod.

### 10.2 Verify the deploy

```bash
kubectl get pods,svc,pvc -n feedback-<env> -l app=backend-api

# logs
kubectl logs -n feedback-<env> -l app=backend-api --tail=50

# port-forward for a quick curl
kubectl port-forward -n feedback-<env> svc/backend-api 3000:80
curl -s localhost:3000/healthz
```

---

## 11. Lint / dry-render the chart

```bash
helm lint  ./helm -f ./helm/envs/dev.yaml
helm template backend-api ./helm -f ./helm/envs/prod.yaml | less
```

---

## 12. End-to-end smoke test (with the frontend)

After deploying **both** repos into `feedback-dev`:

```bash
# backend reachable directly
kubectl port-forward -n feedback-dev svc/backend-api 3000:80 &
curl -s localhost:3000/api/info
curl -s -X POST localhost:3000/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"name":"alice","rating":5,"comment":"loved it"}'
curl -s localhost:3000/api/feedback
```

Now deploy the frontend repo and open it in a browser — the entry should
appear in the list. See the `frontend` repo's README for the full
end-to-end test.

---

## 13. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Pod CrashLoopBackOff | DB_PATH not writable — PVC not mounted, or wrong permissions |
| `400 rating must be an integer 1-5` | The frontend sent a non-integer or out-of-range rating; check the form |
| Old data missing after restart | PVC was not bound, or `persistence.enabled: false` in a non-dev env |
| Service has no endpoints | Selector mismatch — confirm `kubectl get pods -l app=backend-api` returns rows |
| `connection refused` from frontend nginx | Backend not deployed yet, or `BACKEND_UPSTREAM` points to a different service name |
| SQLite locked errors | Two pods writing the same PVC. The chart uses `ReadWriteOnce` — keep `replicaCount: 1` until you add a real database. (See *Roadmap* below.) |

---

## 14. Roadmap

- SQLite is fine for the demo but won't survive `replicaCount > 1` (no
  shared write lock). For HA, swap `better-sqlite3` for Postgres and add
  a `StatefulSet` + `Service` to the chart.
- The chart currently exposes no auth — add an `auth.enabled` switch and
  an API-key middleware before exposing it to the public internet.

---

## 15. Versioning

- Image tag = semver (`1.0.0`, `1.0.1-dev`)
- Bump `Chart.appVersion` and `env.APP_VERSION` together when shipping
  a new build
- The chart `version` (in `Chart.yaml`) only changes when the chart
  templates themselves change
