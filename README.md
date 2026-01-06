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

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env.local` file in the root directory and add your API keys:
   ```env
   TEXT_API_KEY=your_gemini_text_api_key
   IMAGE_API_KEY=your_gemini_image_api_key
   VIDEO_API_KEY=your_gemini_video_api_key
   ```
   *(Note: You can use the same key for all three if your API key supports all modalities)*

## Usage

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to the local URL provided (usually `http://localhost:5173`).

3. **Start Creating**:
   - **Load Novel**: Paste your novel text into the input area.
   - **Configure Style**: Choose a director style, reference work, or visual texture from the settings panel.
   - **Analyze**: Let the AI break down the text into chunks.
   - **Generate**: Use manual controls to step through extraction and generation, or enable "Auto Mode" for automated processing.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **AI Integration**: Google GenAI SDK (`@google/genai`)
- **Icons**: Lucide React
- **State Management**: React Hooks & Local Storage

## License

Private / Proprietary
