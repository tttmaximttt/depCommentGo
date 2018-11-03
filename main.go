package main

import (
  "os"
  "fmt"
  "log"
  "bufio"

  "github.com/tttmaximttt/depCommentGo/jiraSdk"
  "github.com/martinlindhe/notify"
)

func main() {
  command := getCommand(os.Args)
  commentSDK := jiraSdk.CommentsSDK{}
  resultCh := make(chan User, 1)
  defer close(resultCh)

  if string(command) == "login" {
    db, err := CreateConnection()
    defer db.Close()

    if err != nil {
      log.Fatalf("Could not connect to DB: %v", err)
    }

    db.AutoMigrate(&User{})

    repo := &UserRepository{db}

    handler := LoginHandler{repo}

    reader := bufio.NewReader(os.Stdin)

    fmt.Print("Enter JIRA username: ")
    username, _ := reader.ReadString('\n')
    fmt.Print("Enter JIRA password: ")
    password, _ := reader.ReadString('\n')

    go handler.Handle(username, password, resultCh)
  }

  commentSDK.CreateComment("asdfasd")
  user := <- resultCh
  text := fmt.Sprintf("User %s logn sucessffully", user.Email)
  notify.Notify("JIRA auto comment", "notice", text, "")
}
