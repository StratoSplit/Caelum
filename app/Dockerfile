# /Users/dallon/Library/CloudStorage/OneDrive-NorthernArizonaUniversity/Senior Year 2025/CS-486/Last Minute/Caelum/app/Dockerfile
FROM node:23

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Install dotenv
RUN npm install dotenv

# Expose the HTTPS port
EXPOSE 443

# Start the application
CMD ["node", "server.js"]