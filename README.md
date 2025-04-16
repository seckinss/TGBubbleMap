# TG Bubblemaps

A full-stack visualization service for blockchain token holder distribution with a Node.js API and Python Telegram bot.

## Overview

This project provides token holder visualizations through:
1. A Node.js API service for generating interactive bubble map visualizations
2. A Python Telegram bot for accessing visualizations through chat interface

## Features

- **Bubble Map Visualization**: Generates network graphs showing token holder distribution
- **Multi-chain Support**: Works with Ethereum, BSC, Fantom, Avalanche, Polygon, and other chains
- **Dockerized Deployment**: Runs both Node.js and Python components in a single container
- **Telegram Bot Interface**: Provides easy access to visualizations through Telegram

## Architecture

The project consists of two main components:

### Node.js Visualization Service
- TypeScript-based Express API
- Uses D3.js and Sharp for SVG generation and image processing
- RESTful endpoint for generating bubble map PNG images

### Python Telegram Bot
- Provides user-friendly chat interface
- Connects to the Node.js service to request visualizations
- Offers token lookup and chain selection

## Installation

### Prerequisites
- Node.js 16+
- Python 3.10+
- Docker (for containerized deployment)

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/tg-bubblemaps.git
   cd tg-bubblemaps
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Set up Python environment**
   ```bash
   cd telegram-bot
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   cp telegram-bot/.env.example telegram-bot/.env
   # Edit the .env files with your API keys and settings
   ```

5. **Build the TypeScript code**
   ```bash
   npm run build
   ```

### Running with Docker

```bash
# Build and start the container
docker-compose up --build

# Run in background
docker-compose up -d
```

## Usage

### API Endpoints

- **GET /** - API welcome page with documentation
- **GET /health** - Health check endpoint
- **GET /bubble-map?token=ADDRESS&chain=CHAIN** - Generate bubble map visualization

### Telegram Bot Commands

- **/start** - Begin interacting with the bot
- **/token TOKEN_ADDRESS CHAIN** - Generate visualization for a specific token
- **/help** - Show usage instructions

## Deployment

### Heroku Deployment

1. Create a Heroku app
   ```bash
   heroku create tg-bubblemaps
   heroku stack:set container
   ```

2. Configure environment variables
   ```bash
   heroku config:set NODE_ENV=production
   # Add other required environment variables
   ```

3. Deploy
   ```bash
   git push heroku main
   ```

## Technical Details

- **Visualization**: D3.js force-directed graph with custom styling
- **Image Processing**: Sharp for SVG to PNG conversion
- **Fonts**: Uses Liberation Sans for text rendering
- **Data Source**: Connects to Bubblemaps API for token holder data

## Project Structure

```
├── src/                   # Node.js TypeScript source files
│   ├── server.ts          # Express API server
│   ├── utils/             # Utility functions
│   │   ├── api.js         # API clients
│   │   └── visualization.ts # D3.js visualization logic
│   └── types/             # TypeScript type definitions
├── telegram-bot/          # Python Telegram bot 
│   ├── bot.py             # Telegram bot implementation
│   └── requirements.txt   # Python dependencies
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile             # Docker build configuration
└── docker-entrypoint.sh   # Container startup script
```

## License

ISC License 