.PHONY: up down build logs shell-be shell-fe db-migrate db-seed db-reset

up:
	docker compose -f docker-compose.yml up -d

down:
	docker compose -f docker-compose.yml down

build:
	docker compose -f docker-compose.yml build

logs:
	docker compose -f docker-compose.yml logs -f

shell-be:
	docker compose -f docker-compose.yml exec be sh

shell-fe:
	docker compose -f docker-compose.yml exec fe sh

db-migrate:
	docker compose -f docker-compose.yml exec be npx prisma migrate dev

db-seed:
	docker compose -f docker-compose.yml exec be npm run db:seed

db-import:
	docker compose -f docker-compose.yml exec be npm run db:import

db-reset:
	docker compose -f docker-compose.yml exec be npx prisma migrate reset --force --skip-seed
