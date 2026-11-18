class CollisionBlock {
  constructor({ id, position, width = 64, height = 64, type = 'solid', x1, y1, x2, y2 }) {
    this.id = id
    this.position = position
    this.width = width
    this.height = height
    this.type = type
    if (type === 'slope') {
      const swap = x1 > x2
      this.x1 = swap ? x2 : x1
      this.y1 = swap ? y2 : y1
      this.x2 = swap ? x1 : x2
      this.y2 = swap ? y1 : y2
      this.position = { x: this.x1, y: Math.min(this.y1, this.y2) }
      this.width = Math.max(1, this.x2 - this.x1)
      this.height = Math.max(16, Math.abs(this.y2 - this.y1))
    }
  }

  draw() {
    if (this.type === 'slope') {
      c.strokeStyle = 'rgba(255, 0, 0, 0.7)'
      c.lineWidth = 10
      c.beginPath()
      c.moveTo(this.x1, this.y1)
      c.lineTo(this.x2, this.y2)
      c.stroke()
      return
    }
    c.fillStyle = 'rgba(255, 0, 0, 0.5)'
    c.fillRect(this.position.x, this.position.y, this.width, this.height)
  }
}
