# Makefile

.PHONY: build down up all client backend hardhat

down:
	docker compose down

up:
	docker compose build client backend hardhat --no-cache
	docker compose up -d

all: up client backend

build:
	docker compose build client backend hardhat --no-cache

client:
	docker compose build client
	docker compose up client --watch &

backend:
	docker compose build backend
	docker compose up backend --watch &

hardhat:
	docker compose build hardhat
	docker compose up hardhat &

test:
	npm --prefix server run test

smoke:
	npm --prefix server run smoke