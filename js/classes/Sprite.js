class Sprite {
  constructor({
    position,
    imageSrc,
    frameRate = 1,
    animations,
    frameBuffer = 1,
    loop = true,
    autoplay = true,
    destinationSize,
    logicalSize,
    drawOffset,
    sourceFrameSize,
    frameColumns,
    frameCount,
    frameMap,
    frameRects,
    frameCrop,
    flipX = false,
  }) {
    this.position = position
    this.destinationSize = destinationSize
    this.logicalSize = logicalSize
    this.drawOffset = drawOffset || { x: 0, y: 0 }
    this.sourceFrameSize = sourceFrameSize
    this.frameColumns = frameColumns || frameRate
    this.frameCount = frameCount || frameRate
    this.frameMap = frameMap
    this.frameRects = frameRects
    this.frameCrop = frameCrop
    this.flipX = flipX
    const initialImage = new Image()
    this.image = initialImage
    this.loaded = false
    initialImage.onload = () => {
      if (this.image !== initialImage) return
      this.loaded = true
      this.updateDimensions()
    }
    initialImage.onerror = () => console.error(`Failed to load sprite: ${imageSrc}`)
    initialImage.src = imageSrc
    this.frameRate = frameRate
    this.currentFrame = 0
    this.elapsedFrames = 0
    this.frameBuffer = frameBuffer
    this.animations = animations
    this.loop = loop
    this.autoplay = autoplay
    this.currentAnimation

    if (this.animations) {
      for (let key in this.animations) {
        const image = new Image()
        image.onload = () => {
          if (this.image !== image) return
          this.loaded = true
          this.updateDimensions()
        }
        image.onerror = () => console.error(`Failed to load sprite: ${this.animations[key].imageSrc}`)
        image.src = this.animations[key].imageSrc
        this.animations[key].image = image
      }
    }
  }
  updateDimensions() {
    const sourceWidth = this.frameCrop?.width || this.sourceFrameSize?.width || this.image.width / this.frameRate
    const sourceHeight = this.frameCrop?.height || this.sourceFrameSize?.height || this.image.height
    this.width = this.logicalSize?.width || this.destinationSize?.width || sourceWidth
    this.height = this.logicalSize?.height || this.destinationSize?.height || sourceHeight
  }

  getSourceFrame() {
    if (this.frameRects) return this.frameRects[this.currentFrame]

    const frameWidth = this.sourceFrameSize?.width || this.image.width / this.frameRate
    const frameHeight = this.sourceFrameSize?.height || this.image.height
    const columns = this.frameColumns || this.frameRate
    const crop = this.frameCrop || { x: 0, y: 0, width: frameWidth, height: frameHeight }
    const sheetFrame = this.frameMap ? this.frameMap[this.currentFrame] : this.currentFrame
    return {
      x: (sheetFrame % columns) * frameWidth + crop.x,
      y: Math.floor(sheetFrame / columns) * frameHeight + crop.y,
      width: crop.width,
      height: crop.height,
    }
  }

  draw() {
    if (!this.loaded) return
    const cropbox = this.getSourceFrame()

    const destinationX = this.position.x + this.drawOffset.x
    const destinationY = this.position.y + this.drawOffset.y
    const destinationWidth = this.destinationSize ? this.destinationSize.width : this.width
    const destinationHeight = this.destinationSize ? this.destinationSize.height : this.height
    if (this.flipX) {
      c.save()
      c.translate(destinationX + destinationWidth, destinationY)
      c.scale(-1, 1)
      c.drawImage(this.image, cropbox.x, cropbox.y, cropbox.width, cropbox.height, 0, 0, destinationWidth, destinationHeight)
      c.restore()
    } else {
      c.drawImage(
        this.image,
        cropbox.x,
        cropbox.y,
        cropbox.width,
        cropbox.height,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight
      )
    }

    this.updateFrames()
  }

  play() {
    this.currentFrame = 0
    this.elapsedFrames = 0
    this.autoplay = true
  }

  updateFrames() {
    if (!this.autoplay) return

    this.elapsedFrames++

    if (this.elapsedFrames % this.frameBuffer === 0) {
      if (this.currentFrame < this.frameCount - 1) this.currentFrame++
      else if (this.loop) this.currentFrame = 0
    }

    if (this.currentAnimation?.onComplete) {
      if (
        this.currentFrame === this.frameCount - 1 &&
        !this.currentAnimation.isActive
      ) {
        this.currentAnimation.onComplete()
        this.currentAnimation.isActive = true
      }
    }
  }
}
