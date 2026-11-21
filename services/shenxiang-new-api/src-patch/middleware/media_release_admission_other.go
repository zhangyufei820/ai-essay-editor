//go:build !unix

package middleware

import "github.com/gin-gonic/gin"

func MediaReleaseAdmission(string) gin.HandlerFunc {
	return func(c *gin.Context) { c.Next() }
}
