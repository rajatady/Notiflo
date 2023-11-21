export PROJECT_NAME=rajatady/notiflo

docker build -t $PROJECT_NAME -f Dockerfile .

docker image push $PROJECT_NAME
