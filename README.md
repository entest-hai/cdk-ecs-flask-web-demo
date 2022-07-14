#

## Docker build

```bash
docker build -t flask-app .
```

and run

```bash
docker run -d -p 3000:3000 flask-app:latest
```

## Docker commands

```bash
docker ps
```

stop all running containers

```bash
docker kill $(docker ps -q)
```

delete all docker images

```
docker system prune -a
```
