# AI Storyboarder (Duanju)

An AI-powered tool for converting novel text into visual storyboards and video content. This application analyzes text, extracts characters and scenes, generates scripts, and produces corresponding images and videos using Google's Gemini AI.

## Features

- **Novel Analysis**: Automatically chunks and analyzes novel text into manageable segments.
- **Asset Extraction**: Identifies and maintains consistency for characters, locations, and items.
- **Scene Scripting**: Converts narrative text into structured scenes with detailed visual descriptions, camera angles, and lighting.
- **AI Image & Video Generation**: Generates high-quality visuals for each scene using AI models.
- **Style Customization**: Supports various artistic styles mimicking famous directors, specific movies, and artistic textures (e.g., Ink Wash, Cyberpunk, Oil Painting).
- **Automation**: "Auto Mode" for continuous end-to-end generation pipeline (Extract -> Script -> Generate).
- **Session Management**: Auto-saves your progress locally so you never lose your work.
- **Multi-language Support**: Interface and analysis support for Chinese and English.

## Prerequisites

- Node.js (v18 or higher recommended)
- Google Gemini API Keys (Text, Image, and Video capabilities)

## Installation

1. Clone the repository or download the source code.

2. Install dependencies (Root and Server):
   ```bash
   # Install root dependencies
   npm install

   # Install server dependencies
   cd server
   npm install
   cd ..
   ```

3. Configure Environment Variables:
   Create a `.env` file in the root directory (or `.env.local`) and add your API keys:
   ```env
   TEXT_API_KEY=your_gemini_text_api_key
   IMAGE_API_KEY=your_gemini_image_api_key
   VIDEO_API_KEY=your_gemini_video_api_key
   ```
   *(Note: You can use the same key for all three if your API key supports all modalities)*

## Usage

### Development Mode

To run the application in development mode, you need to start both the backend server and the frontend development server.

1. **Start the Backend Server** (Required for API Proxy):
   ```bash
   npm run server
   ```
   *The server will start on port 3002.*

2. **Start the Frontend Development Server** (In a new terminal):
   ```bash
   npm run dev
   ```
   *The frontend will start on http://localhost:3000 (or the port shown in your terminal).*

### Production Mode

To build and run the application for production:

1. **Build the Frontend**:
   ```bash
   npm run build
   ```

2. **Start the Application**:
   ```bash
   npm run start
   ```
   *This command starts the backend server, which will also serve the built frontend files at http://localhost:3002.*

## Project Structure

- **`/` (Root)**: Frontend React application (Vite).
- **`/server`**: Backend Node.js/Express server. Handles API proxying and static file serving.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Node.js, Express (Proxy Server)
- **AI Integration**: Google GenAI SDK (`@google/genai`)
- **Icons**: Lucide React
- **State Management**: React Hooks & Local Storage

## License

Private / Proprietary
