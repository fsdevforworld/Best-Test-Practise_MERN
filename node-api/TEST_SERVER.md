# Setting up the testing server

1. Create a new key pair for the deploy user
    ```
    ssh-keygen -m PEM -t rsa -C "deploy@dave.com"
    ```
2. Create a new instance on google
3. Add the ssh private key to the instance via the google cloud console
4. SSH Into the new instance and install required tools 
    ```
    sudo apt-get install github
    sudo apt-get install docker-compose
    # I used the docker installation script which worked for me
    curl -fsSL https://get.docker.com | sh;
    sudo service docker start
    # add docker go the group
    sudo groupadd docker && sudo usermod -aG docker deploy
    # install nginx
    sudo apt-get install nginx
    sudo systemctl start nginx
    ```

5. Add the server config for nginx (this should be added to the default nginx config in the http section)
    ```bash
    http {
            server {
                listen  80;
                if ($http_host ~ (.*)\.test\.trydave\.com) {
                    set $subdomain $1;
                    rewrite (.*)$ http://$subdomain$1 permanent;
                }
                rewrite ^(/)(.*)$ http://test.trydave.com/$2 permanent;
            }
    ```
5. You should also uncomment the following line in nginx.conf:
    ```
    # server_names_hash_bucket_size: 64
    ```
5. Restart Nginx
    ```
    sudo systemctl restart nginx
    ```
6. Generate a new ssh key on the instance and add that to a github account. Follow help here:
    https://help.github.com/en/articles/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent 
8. in the /home/deploy directory clone the node-api repo (this will be the location of the testing-deploy script)
7. Add the SSH key to circle ci by clicking on the gear in the top right while looking at a node-api task and then going to SSH Permissions.
8. Add the fingerprint to .circleci/config.yml under the run_testing_deploy task
