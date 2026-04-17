FROM node:20-alpine

WORKDIR /app

COPY shared ./shared
COPY services/wallet-service/package.json ./
COPY services/wallet-service/src ./src

RUN echo '{"compilerOptions":{"target":"ES2022","module":"ES2022","lib":["ES2022"],"moduleResolution":"node","baseUrl":".","outDir":"./dist","paths":{"shared/*":["./shared/*"]},"strict":true,"esModuleInterop":true,"skipLibCheck":true,"forceConsistentCasingInFileNames":true,"resolveJsonModule":true,"allowSyntheticDefaultImports":true},"include":["src/**/*"],"exclude":["node_modules","dist"]}' > tsconfig.json

RUN npm install

EXPOSE 3008

CMD sh -c "npm install && echo '{\"compilerOptions\":{\"target\":\"ES2022\",\"module\":\"ES2022\",\"lib\":[\"ES2022\"],\"moduleResolution\":\"node\",\"baseUrl\":\".\",\"outDir\":\"./dist\",\"paths\":{\"shared/*\":[\"./shared/*\"]},\"strict\":true,\"esModuleInterop\":true,\"skipLibCheck\":true,\"forceConsistentCasingInFileNames\":true,\"resolveJsonModule\":true,\"allowSyntheticDefaultImports\":true},\"include\":[\"src/**/*\"],\"exclude\":[\"node_modules\",\"dist\"]}' > tsconfig.docker.json && if [ \"\$NODE_ENV\" = \"development\" ]; then npx tsx watch --tsconfig tsconfig.docker.json src/index.ts; else npx tsx --tsconfig tsconfig.docker.json src/index.ts; fi"
