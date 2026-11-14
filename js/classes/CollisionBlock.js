class CollisionBlock {
  constructor({ id, position, width = 64, height = 64, type = 'solid' }) {
    this.id = id
    this.position = position
    this.width = width
    this.height = height
    this.type = type
  }

  draw() {
    c.fillStyle = 'rgba(255, 0, 0, 0.5)'
    c.fillRect(this.position.x, this.position.y, this.width, this.height)
  }
}
