FROM python:3.12-slim

WORKDIR /app

COPY services/gateway/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY packages/common /app/packages/common
RUN pip install -e /app/packages/common

COPY services/risk-engine /app/services/risk-engine

ENV PYTHONPATH=/app

CMD ["python", "-m", "services.risk_engine.src.main"]
