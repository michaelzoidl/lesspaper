FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install basic dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    wget \
    python3 \
    python3-pip \
    libleptonica-dev \
    pkg-config \
    libmagickwand-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Tesseract OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Install ImageMagick
RUN apt-get update && apt-get install -y \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Clone and build llama.cpp
RUN git clone https://github.com/ggerganov/llama.cpp.git && \
    cd llama.cpp && \
    mkdir build && \
    cd build && \
    cmake -DCMAKE_C_FLAGS="-mcpu=cortex-a53" -DCMAKE_CXX_FLAGS="-mcpu=cortex-a53" .. && \
    cmake --build . --config Release

# Create directory for the application
WORKDIR /app

# Copy the built binary from your local build directory
COPY ./build /app/build

# Set executable permissions
RUN chmod +x /app/build/*

# Command to run the lesspaper binary
CMD ["/app/build/lesspaper"]
