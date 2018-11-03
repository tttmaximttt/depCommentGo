package main

import (
  "log"
  "fmt"
)

type Handler interface {
  Handle(username, password string) (result chan <- User)
}

type LoginHandler struct {
  repo Repository
}

func (lh *LoginHandler) Handle(username, password string, result chan User) {
  localIp := getLocalIpAddr()

  fmt.Println("<<<><><><><>localIp", localIp)

  user := User{username, password}
  err := lh.repo.Create(&user)

  if err != nil {
    log.Fatal("Login fail")
    panic(err)
  }

  result <- user
}