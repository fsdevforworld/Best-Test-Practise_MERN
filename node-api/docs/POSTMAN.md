# Dave Postman Collections


## Getting started
Download Postman here: https://www.getpostman.com/downloads/

## Importing a Collection

1. Launch Postman

2. Select "Import" in the top left corner

3. Choose the desired collection JSON file from this directory

## Importing an Environment

You also need to import an environment that has access to variables made via Postman scripts

1. In Postman, click on the gear icon next to the eyeball icon in the top right corner

2. Select "Import"

3. Choose the desired environment JSON file in the collection directory

4. Once the environment has been added, select the desired environment from the dropdown to the left of the eyeball and gear icon

## Run the API

1. Start the API with the following command

```bash
$ npm run env-clean && npm run env-up && npm run dev-seed-down && npm run dev-seed && npm run dev
```

## Make Requests

1. In Postman under the "Collections" tab, open the imported collection

2. Select any of the requests in the collection

3. Click "Send" to make a request

4. Change Headers, Body, and Tests as desired

## Creating a Collection/Saving Requests to a Collection

1. In Postman, click "New" in the top left corner

2. Select "Collection" and provide a collection name and description and click "Create" (Note: Collection should be named after the routes that are included in that collection e.g. the user routes collection is named /user)

3. You should see the collection is now displayed on the left, and you can now click "Save" on any particular request and select "Save As" to save that request to your new collection

## Exporting a Collection

1. In Postman, highlight the desired collection to export on the left

2. Click on "..." and then select "Export"

3. Go with the recommended option for exporting and click "Export" and save your collection in a directory named after the routes that are in that directory e.g. the users collection JSON file is saved at `node-api/postman/user/`

## Running a collection from the command line

1. Install Newman

```bash
$ npm install -g newman
```

2. Run the desired collection and environment

```bash
$ newman run postman/user/user.postman_collection.json -e postman/user/dev.postman_environment.json
```
