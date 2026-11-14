class Player extends Sprite {
  constructor({
    collisionBlocks = [],
    imageSrc,
    frameRate,
    frameBuffer,
    animations,
    loop,
    destinationSize,
    logicalSize,
    drawOffset,
    sourceFrameSize,
    frameColumns,
    frameCount,
    frameMap,
    frameCrop,
    flipX,
  }) {
    super({
      imageSrc,
      frameRate,
      frameBuffer,
      animations,
      loop,
      destinationSize,
      logicalSize,
      drawOffset,
      sourceFrameSize,
      frameColumns,
      frameCount,
      frameMap,
      frameCrop,
      flipX,
    })
    this.position = {
      x: 200,
      y: 200,
    }

    this.velocity = {
      x: 0,
      y: 0,
    }

    this.sides = {
      bottom: this.position.y + this.height,
    }
    this.gravity = 1

    this.collisionBlocks = collisionBlocks
  }

  update() {
    // this is the blue box
    // c.fillStyle = 'rgba(0, 0, 255, 0.5)'
    // c.fillRect(this.position.x, this.position.y, this.width, this.height)

    this.updateHitbox()
    const previousHitbox = { ...this.hitbox.position, width: this.hitbox.width, height: this.hitbox.height }
    this.position.x += this.velocity.x
    this.updateHitbox()

    this.checkForHorizontalCollisions(previousHitbox)
    this.updateHitbox()
    const previousHitboxTop = this.hitbox.position.y
    const previousHitboxBottom = previousHitboxTop + this.hitbox.height
    this.applyGravity()

    this.updateHitbox()
    this.checkForVerticalCollisions(previousHitboxTop, previousHitboxBottom)
    this.constrainToWorldBounds()
  }

  handleInput(keys) {
    if (this.preventInput) return
    this.velocity.x = 0
    if (keys.d.pressed) {
      this.switchSprite('runRight')
      this.velocity.x = 4
      this.lastDirection = 'right'
    } else if (keys.a.pressed) {
      this.switchSprite('runLeft')
      this.velocity.x = -4
      this.lastDirection = 'left'
    } else {
      if (this.lastDirection === 'left') this.switchSprite('idleLeft')
      else this.switchSprite('idleRight')
    }
  }

  switchSprite(name) {
    if (this.image === this.animations[name].image) return
    this.currentFrame = 0
    this.image = this.animations[name].image
    this.loaded = this.image.complete && this.image.naturalWidth > 0
    this.frameRate = this.animations[name].frameRate
    this.frameBuffer = this.animations[name].frameBuffer
    this.loop = this.animations[name].loop
    this.currentAnimation = this.animations[name]
    this.sourceFrameSize = this.currentAnimation.sourceFrameSize
    this.frameColumns = this.currentAnimation.frameColumns || this.frameRate
    this.frameCount = this.currentAnimation.frameCount || this.frameRate
    this.frameMap = this.currentAnimation.frameMap
    this.frameCrop = this.currentAnimation.frameCrop
    this.destinationSize = this.currentAnimation.destinationSize
    this.logicalSize = this.currentAnimation.logicalSize
    this.drawOffset = this.currentAnimation.drawOffset || { x: 0, y: 0 }
    this.flipX = this.currentAnimation.flipX || false
    this.updateDimensions()
  }

  updateHitbox() {
    this.hitbox = {
      position: {
        x: this.position.x + 48,
        y: this.position.y + 34,
      },
      width: 66,
      height: 53,
    }
  }

  checkForHorizontalCollisions(previousHitbox) {
    for (let i = 0; i < this.collisionBlocks.length; i++) {
      const collisionBlock = this.collisionBlocks[i]
      if (collisionBlock.type !== 'solid' && collisionBlock.type !== 'wall') continue

      const verticalOverlap =
        this.hitbox.position.y < collisionBlock.position.y + collisionBlock.height &&
        this.hitbox.position.y + this.hitbox.height > collisionBlock.position.y
      if (!verticalOverlap) continue

      const blockLeft = collisionBlock.position.x
      const blockRight = blockLeft + collisionBlock.width
      const previousLeft = previousHitbox.x
      const previousRight = previousLeft + previousHitbox.width
      const currentLeft = this.hitbox.position.x
      const currentRight = currentLeft + this.hitbox.width

      if (
        this.velocity.x > 0 &&
        previousRight <= blockLeft &&
        currentRight >= blockLeft
      ) {
        this.position.x += blockLeft - currentRight - 0.01
        this.velocity.x = 0
        this.updateHitbox()
        continue
      }

      if (
        this.velocity.x < 0 &&
        previousLeft >= blockRight &&
        currentLeft <= blockRight
      ) {
        this.position.x += blockRight - currentLeft + 0.01
        this.velocity.x = 0
        this.updateHitbox()
      }
    }
  }

  applyGravity() {
    this.velocity.y += this.gravity
    this.position.y += this.velocity.y
  }

  constrainToWorldBounds() {
    if (!this.worldBounds || !this.width || !this.height) return
    this.position.x = Math.max(
      this.worldBounds.left,
      Math.min(this.position.x, this.worldBounds.right - this.width)
    )
    this.position.y = Math.max(
      this.worldBounds.top,
      Math.min(this.position.y, this.worldBounds.bottom - this.height)
    )
    this.updateHitbox()
  }

  checkForVerticalCollisions(previousTop, previousBottom) {
    let collision = null
    let nearestSurface = this.velocity.y > 0 ? Infinity : -Infinity

    for (let i = 0; i < this.collisionBlocks.length; i++) {
      const collisionBlock = this.collisionBlocks[i]
      if (collisionBlock.type === 'trigger' || collisionBlock.type === 'wall') continue

      const horizontalOverlap =
        this.hitbox.position.x < collisionBlock.position.x + collisionBlock.width &&
        this.hitbox.position.x + this.hitbox.width > collisionBlock.position.x
      if (!horizontalOverlap) continue

      const blockTop = collisionBlock.position.y
      const blockBottom = blockTop + collisionBlock.height
      const currentTop = this.hitbox.position.y
      const currentBottom = currentTop + this.hitbox.height

      if (
        this.velocity.y > 0 &&
        collisionBlock.type !== 'ceiling' &&
        previousBottom <= blockTop &&
        currentBottom >= blockTop
      ) {
        if (blockTop < nearestSurface) {
          nearestSurface = blockTop
          collision = { blockTop }
        }
        continue
      }

      if (
        this.velocity.y < 0 &&
        collisionBlock.type !== 'oneWay' &&
        collisionBlock.type !== 'trigger' &&
        previousTop >= blockBottom &&
        currentTop <= blockBottom
      ) {
        if (blockBottom > nearestSurface) {
          nearestSurface = blockBottom
          collision = { blockBottom }
        }
      }
    }

    if (collision?.blockTop !== undefined) {
      this.position.y += collision.blockTop - this.hitbox.position.y - this.hitbox.height - 0.01
      this.velocity.y = 0
      this.updateHitbox()
    } else if (collision?.blockBottom !== undefined) {
      this.position.y += collision.blockBottom - this.hitbox.position.y + 0.01
      this.velocity.y = 0
      this.updateHitbox()
    }
  }
}
