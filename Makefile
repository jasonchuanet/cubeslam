.DEFAULT_GOAL := build

node_modules: package-lock.json
	npm ci

build: node_modules
	npm run build

test: build
	npm test

start: build
	npm start

dev: node_modules
	npm run dev

docker:
	docker compose up --build -d

clean:
	rm -rf build

.PHONY: build test start dev docker clean
