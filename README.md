> ⚠️ **Work in Progress**: This project is currently under active development. Some features need to be updated and tested for cross-machine compatibility. Feel free to try it out, but expect some rough edges!

<div align="center" style="margin: 3em 0;">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/91ca183e-d131-44a8-a81e-99e28ffcdc33">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1517659e-db8a-43d9-8229-4890aa487011">
    <img alt="Lesspaper Logo" src="https://github.com/user-attachments/assets/1517659e-db8a-43d9-8229-4890aa487011" width="400">
  </picture>
</div>

> 🚀 Your smart document management system with AI-powered organization!

Lesspaper is an intelligent document management system that automatically organizes your documents using advanced AI capabilities. It uses OCR to extract text from your documents and leverages the DeepSeek LLM for smart categorization and searching.

## ✨ Features

- 🤖 AI-powered document categorization using DeepSeek LLM
- 📝 OCR text extraction from various document types
- 🔍 Smart search capabilities
- 🖼️ Document preview generation
- 🌐 Clean and modern web interface
- ⚡ Fast and efficient file processing
- 🛠️ Zero configuration needed - just run and go

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

#### For macOS (using Homebrew):
```bash
# Install required dependencies
brew install tesseract
brew install tesseract-lang
brew install llama-cpp
brew install imagemagick
```

Other required components:
- Tesseract OCR and language packs
- LLM requirements (DeepSeek)
- ImageMagick for image processing

### Installation

1. Download the latest release from our releases page (coming soon!)
2. Run Lesspaper - it will automatically create a `.lesspaper` folder in your root directory where all processed data, indexes, and search information will be stored.

### Running Lesspaper

```bash
# If you're using the pre-built binary:
./lesspaper

# For development:
# Start development server with hot-reload
deno task dev

# Build your own binary
deno task compile

# Start the UI (./ui folder)
npm run dev
```

## 💻 For Developers

> 💡 **Pro tip**: Use the `project.code-workspace` file to open the project in VS Code. This ensures proper linting configuration since the project uses both Deno and TypeScript in different parts of the codebase.

## 🏗️ Development Status

### Platform Support

- ✅ macOS - Fully tested and supported
- 🚧 Docker - Work in progress
- ⏳ Windows - Not yet tested
- ⏳ Linux - Not yet tested
- ⏳ Synology - Not yet tested

## 🤝 Contributing

We welcome contributions! Feel free to:
- Submit bug reports
- Propose new features
- Submit pull requests

## 🔜 Upcoming Features

- 🌐 Browser auto-launch on startup
- ⚙️ UI-based configuration editor
- 🎯 First-time setup wizard
- 🐳 Docker support
- 📱 Mobile-friendly interface

## ⚠️ Important Notes

- Currently, the DeepSeek LLM is used for document categorization and provides excellent results
- Platform support beyond macOS is still under development

## 🆘 Need Help?

If you encounter any issues or need assistance:
- Check our documentation (coming soon)
- Submit an issue on GitHub
- Join our community discussions

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.