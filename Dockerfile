# Use the official Apify Node.js base image (Node 18 + Chromium)
FROM apify/actor-node:18

# Copy package files and install dependencies
COPY package*.json ./
RUN npm --quiet set progress=false \
 && npm install --only=prod --no-optional \
 && echo "NPM install complete."

# Copy the rest of the source
COPY . ./

# Set the default command
CMD npm start --silent
