FROM node:20-alpine
WORKDIR /workspace/hardhat
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
CMD ["npm","run","node"]
