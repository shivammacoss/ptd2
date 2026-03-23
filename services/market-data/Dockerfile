FROM python:3.12-slim

WORKDIR /app

COPY services/market-data/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY packages/common /app/packages/common
RUN pip install -e /app/packages/common

COPY services/market-data /app/services/market-data

ENV PYTHONPATH=/app

CMD ["python", "-m", "services.market_data.src.main"]
