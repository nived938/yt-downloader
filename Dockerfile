FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV DENO_INSTALL=/usr/local
ENV PATH="/usr/local/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg python3 unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && ln -sf /usr/local/bin/deno /usr/bin/deno \
    && deno --version \
    && ffmpeg -version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
