package jiraSdk

import (
  "fmt"
  "path"
  "os/exec"
  "strings"
  "log"
  "bytes"
)

const (
  managerKey = "ManagerService"
  wsKey = "WebSocketConnectionService"
  converterKey = "ConverterService"
  restKey = "RestAPIService"
  ahsKey = "ActivityHistoryService"
  nativeKey = "NativeEditService"
  header = "h1. >>>>>>>>>>>>>>>>>>>> DEPLOYMENT COMMENT <<<<<<<<<<<<<<<<<<<\n"
  footer = "h1. >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<<<<<"
  rowTemplate = "h3. %s %s\n"
  allowToDeploy = "(/)"
  dontDeploy = "(x)"
)

func getGitChangedFiles(resultChan chan []string) chan []string {
  cmd := exec.Command("git", "status", "-s")
  cmd.Stdin = strings.NewReader("some input")
  var out bytes.Buffer
  cmd.Stdout = &out
  err := cmd.Run()
  if err != nil {
    log.Fatal(err)
  }

  commandResult := strings.Split(out.String(), "\n")

  for index, filePath := range commandResult {
    filePath = strings.Replace(filePath, "A ", "", 2)
    filePath = strings.Replace(filePath, "AM ", "", 2)
    filePath = strings.Trim(filePath, " ")

    if len(filePath) > 0 {
      commandResult[index] = filePath
    }
  }

  resultChan <- commandResult
  return resultChan
}

func getServiceNameFromPath(filePaths chan []string) {
  filePathsArr := <- filePaths
  fmt.Println(">><><>", filePathsArr)
  for _, filePath := range filePathsArr {
    dirs := path.Dir(filePath)
    dirsArr := strings.Split(dirs, "/")

    if len(dirsArr) > 1 {
      fmt.Println("DIRS>>", dirsArr[1])
    }
  }
}

func tmplFn(stringTmpl, markStr, key string) string {
  result := fmt.Sprintf(stringTmpl, key, allowToDeploy)
  if markStr != "" {
    result = fmt.Sprintf(stringTmpl, key, markStr)
  }

  return result
}

type SDK interface {
  GetAllComments(issueIdOrKey string) ([]byte, error)
  GetComment(issueIdOrKey, commentId string) (bool, error)
  CreateComment(issueIdOrKey string) (bool, error)
}

var servicesMap = map[string]string{
  ahsKey: ahsKey,
  converterKey: converterKey,
  managerKey: managerKey,
  nativeKey: nativeKey,
  restKey: restKey,
  wsKey: wsKey,
}

type CommentsSDK struct {}

func (sdk *CommentsSDK) CreateComment(issueIdOrKey string) (bool, error) {
  changeFiles := make(chan []string, 1)
  defer close(changeFiles)

  getGitChangedFiles(changeFiles)
  getServiceNameFromPath(changeFiles)

  comment := header
  comment += tmplFn(rowTemplate, allowToDeploy, managerKey)
  comment += tmplFn(rowTemplate, allowToDeploy, wsKey)
  comment += tmplFn(rowTemplate, dontDeploy, converterKey)
  comment += tmplFn(rowTemplate, dontDeploy, restKey)
  comment += tmplFn(rowTemplate, dontDeploy, ahsKey)
  comment += tmplFn(rowTemplate, dontDeploy, nativeKey)
  comment += footer

  return true, nil
}