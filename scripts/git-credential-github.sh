#!/bin/bash
# Credential helper per GitHub — legge GITHUB_TOKEN dall'env
# Usato da git config credential."https://github.com".helper
echo "username=x-token-auth"
echo "password=${GITHUB_TOKEN}"
