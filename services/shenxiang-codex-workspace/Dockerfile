ARG BASE_IMAGE=python:3.11-slim
FROM ${BASE_IMAGE}

ARG CODEX_CLI_VERSION=0.132.0

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl nodejs npm git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

RUN npm install -g @openai/codex@${CODEX_CLI_VERSION}

COPY app /app/app
COPY web /app/web
COPY docs /app/docs
COPY worker.py /app/worker.py
COPY skill_registry.json /app/skill_registry.json
COPY skills /opt/codex-skills

RUN mkdir -p /workspace/runs /workspace/user-skills /codex-home

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
