# Cosmic Facts - Backend

Node.js/Express API that serves space facts and counts likes (in memory).

| Endpoint | Description |
|---|---|
| `GET /healthz` | Health probe |
| `GET /api/info` | Service, version, environment, pod name |
| `GET /api/facts` | All facts with like counts |
| `GET /api/facts/random` | One random fact |
| `POST /api/facts/:id/like` | Like a fact |

## Local
```
npm install && npm test && npm start   # http://localhost:3000
```

## Harness pipeline
1. **Build app** - `npm install && npm test`
2. **Build image** - `docker build -t <registry>/cosmic-backend:<+pipeline.sequenceId> .` and push
3. **Deploy** - Helm, same namespace as the frontend:
```
helm upgrade --install cosmic-backend ./helm \
  -n cosmic-facts --create-namespace \
  -f helm/values.yaml -f helm/envs/<dev|staging|prod>.yaml \
  --set image.repository=<registry>/cosmic-backend --set image.tag=<tag>
```
The Service is named `cosmic-backend` (ClusterIP, port 80) - the frontend proxies `/api` to it.
Likes are held in memory per pod, so with multiple replicas counts are per-pod (a good talking point; swap in Redis later).
