FROM node:20-alpine

WORKDIR /app

# Copy shared utilities
COPY shared ./shared

# Copy service package.json and source files
COPY services/auth-service/package.json ./
COPY services/auth-service/src ./src

# Create Docker-compatible standalone tsconfig with path mappings for shared modules
RUN echo '{"compilerOptions":{"target":"ES2022","module":"ES2022","lib":["ES2022"],"moduleResolution":"node","baseUrl":".","outDir":"./dist","paths":{"shared/*":["./shared/*"]},"strict":true,"esModuleInterop":true,"skipLibCheck":true,"forceConsistentCasingInFileNames":true,"resolveJsonModule":true,"allowSyntheticDefaultImports":true},"include":["src/**/*"],"exclude":["node_modules","dist"]}' > tsconfig.json

# Install dependencies (will be overridden by volume mount in dev, but needed for production)
RUN npm install

# Expose port
EXPOSE 3001

# Start service - create Docker-compatible tsconfig at runtime (for dev volumes) and start
# Use watch mode in development, regular mode in production
CMD sh -c "npm install && echo '{\"compilerOptions\":{\"target\":\"ES2022\",\"module\":\"ES2022\",\"lib\":[\"ES2022\"],\"moduleResolution\":\"node\",\"baseUrl\":\".\",\"outDir\":\"./dist\",\"paths\":{\"shared/*\":[\"./shared/*\"]},\"strict\":true,\"esModuleInterop\":true,\"skipLibCheck\":true,\"forceConsistentCasingInFileNames\":true,\"resolveJsonModule\":true,\"allowSyntheticDefaultImports\":true},\"include\":[\"src/**/*\"],\"exclude\":[\"node_modules\",\"dist\"]}' > tsconfig.docker.json && if [ \"\$NODE_ENV\" = \"development\" ]; then npx tsx watch --tsconfig tsconfig.docker.json src/index.ts; else npx tsx --tsconfig tsconfig.docker.json src/index.ts; fi"
