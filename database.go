package main

import (
  "github.com/jinzhu/gorm"
  _ "github.com/jinzhu/gorm/dialects/sqlite"
)

func CreateConnection() (*gorm.DB, error) {
  return gorm.Open("sqlite3", "./gorm.db")
}