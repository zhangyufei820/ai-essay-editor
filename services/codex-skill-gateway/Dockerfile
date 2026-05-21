ARG BASE_IMAGE=codex-skill-gateway-codex-gateway:latest
FROM ${BASE_IMAGE}

ARG CODEX_CLI_VERSION=0.132.0

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

RUN npm install -g @openai/codex@${CODEX_CLI_VERSION}

COPY app /app/app
COPY worker.py /app/worker.py
COPY skill_registry.json /app/skill_registry.json
COPY skills /opt/codex-skills

RUN mkdir -p /workspace/runs /codex-home

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
